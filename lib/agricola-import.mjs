import { normalizeHeader, parsePastedTable, QUARTER_MONTHS } from "./pasted-table.mjs"
import { selectFieldActivities } from "./field-activities.mjs"

export const AGRICOLA_BLOCKS = [
  { id: "commercial", label: "Gestión comercial", required: ["Territorio","Empleado","Meta Cobertura y Visitas","Clientes Visitados","Cant. Visitas","Meta Clientes Recuperar","Cant. Clientes Nuevos","Mes"] },
  { id: "promoters", label: "Gestión de promotores", required: ["Territorio","Empleado","Meta Cobertura","Clientes Visitados","Meta Visitas","Cant. Visitas","Meta Clientes Nuevos","Cant. Clientes Nuevos","Mes"] },
  { id: "technical", label: "Técnico", required: ["Territorio","Grupo Artículos","Ppto","Valor Recomendaciones","Meta Referencias","Referencias Recomendadas","Mes"] },
  { id: "leads", label: "Leads", required: ["Unidad de Negocio","Empleado","Meta Leads","Calificados Oportunos","Fuera de Tiempo","Leads calificados","Pendientes","Mes"] },
  { id: "farms", label: "Fincas", required: ["Unidad de Negocio","des_territorio","atr_desc_empleado","atr_cultivo_texto","# Fincas","Héctareas","Mes"] },
  { id: "activities", label: "Actividades de campo — todos los canales", required: ["ID","Estado","Tipo de visita","Propietario","Fecha/Hora de inicio","Territorio de ventas"] },
]
const key = normalizeHeader
const numeric = new Set(["Meta Cobertura y Visitas","Clientes Visitados","Cant. Visitas","Meta Clientes Recuperar","Cant. Clientes Nuevos","Meta Cobertura","Meta Visitas","Meta Clientes Nuevos","Ppto","Valor Recomendaciones","Valor Ventas","Meta Referencias","Referencias Recomendadas","Meta Leads","Calificados Oportunos","Fuera de Tiempo","Leads calificados","Pendientes","# Fincas","Héctareas"].map(key))
export function rawNumber(value) {
  const text = String(value ?? "").trim()
  if (!text) return null
  const percent = text.endsWith("%")
  let cleaned = text.replace(/%$/, "").replace(/\s/g,"")
  if (cleaned.includes(",") && cleaned.includes(".")) cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? cleaned.replace(/\./g,"").replace(",",".") : cleaned.replace(/,/g,"")
  else if (cleaned.includes(",")) cleaned=cleaned.replace(",",".")
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return NaN
  return Number(cleaned) / (percent ? 100 : 1)
}
export function prepareAgricolaBlock(id, text, year, quarter) {
  const spec = AGRICOLA_BLOCKS.find(block => block.id === id)
  if (!spec) throw new Error("Bloque desconocido")
  // Also accepts the activity export's two preamble lines.
  const lines = String(text).split(/\r?\n/)
  if (id === "activities") {
    const start = lines.findIndex(line => {
      const headers=parsePastedTable(line).headers.map(key)
      return headers.includes("id") && headers.includes("tipo de visita") && headers.includes("fecha/hora de inicio")
    })
    if (start >= 0) text=lines.slice(start).join("\n")
  }
  const table = parsePastedTable(text)
  const issues = [...table.errors], warnings = []
  const indices = new Map(table.headers.map((header,index)=>[key(header),index]))
  for (const header of spec.required) if (!indices.has(key(header))) issues.push("Falta columna: " + header)
  if (!Number.isInteger(year) || year<2000 || year>2100 || !QUARTER_MONTHS[quarter]) issues.push("Periodo inválido")
  if (issues.length) return { ...table, records: [], issues, warnings, excluded: 0 }
  const canonical=new Map(spec.required.map(header=>[key(header),header]))
  const records=table.rows.map((row,rowIndex)=>{
    const record={}
    table.headers.forEach((header,index)=>{
      const field=canonical.get(key(header)) ?? header.trim()
      const value=row[index]
      if (numeric.has(key(header))) {
        record[field]=rawNumber(value)
        if (Number.isNaN(record[field]) || record[field] < 0) issues.push("Fila " + (rowIndex+2) + ": número inválido en " + header)
      } else record[field]=value
    })
    return record
  })
  if (id==="activities") {
    const selected=selectFieldActivities(records,{year,quarter,sourceKey:"PYC-AGR-ANT"})
    issues.push(...selected.issues.map(issue=>"Actividad " + (issue.id ?? issue.row) + ": " + issue.reason))
    return { ...table, records:selected.accepted, issues, warnings, excluded:selected.excluded.length }
  }
  const months=new Set(QUARTER_MONTHS[quarter].map(key))
  const included=records.filter(record=>months.has(key(record.Mes)))
  const filtered=included.filter(record=>{
    const unit=record["Unidad de Negocio"]
    return unit ? key(unit)==="agricola antioquia" : key(record.Territorio).startsWith("pyc agricola ant")
  })
  const seen=new Set()
  const fields=id==="technical"?["Territorio","Grupo Artículos","Mes"]:id==="farms"?["des_territorio","atr_desc_empleado","atr_cultivo_texto","Mes"]:id==="leads"?["Unidad de Negocio","Empleado","Mes"]:["Territorio","Empleado","Mes"]
  for(const record of filtered) {
    const identity=fields.map(field=>key(record[field])).join("|")
    if(seen.has(identity)) issues.push("Registro repetido: " + fields.map(field=>record[field]).join(" / "))
    seen.add(identity)
  }
  warnings.push("El exportado no incluye año: se usa el año seleccionado.")
  for (const month of QUARTER_MONTHS[quarter]) if(!filtered.some(record=>key(record.Mes)===key(month))) warnings.push("Sin registros de " + month + ": revisar si no hubo actividad o falta información.")
  return { ...table, records:filtered, issues, warnings, excluded:records.length-filtered.length }
}
export function technicalReferenceCount(record) {
  const ratio=record["Referencias Recomendadas"],target=record["Meta Referencias"]
  return ratio===null || target===null ? null : ratio*target
}

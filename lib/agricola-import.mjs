import { findHeaderRow, normalizeHeader, parseDelimitedRows, QUARTER_MONTHS, tableFromRows } from "./pasted-table.mjs"
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
const NUMERIC = new Set(["Meta Cobertura y Visitas","Clientes Visitados","Cobertura Clientes","Cant. Visitas","Ejec. Visitas","Meta Clientes Recuperar","Cant. Clientes Nuevos","Ejec. Clientes Nuevos","Meta Cobertura","Meta Visitas","Meta Clientes Nuevos","Ppto","Valor Recomendaciones","Recomendaciones vs Ppto","Valor Ventas","% Paticipación Recomendación","Meta Referencias","Referencias Recomendadas","Meta Leads","Calificados Oportunos","Fuera de Tiempo","Leads calificados","Pendientes","# Fincas","Héctareas"].map(key))
const ACTIVITY_FIELDS = ["ID", "Estado", "Tipo de visita", "Propietario", "Fecha/Hora de inicio", "Territorio de ventas"]
const IDENTITY = {
  commercial: ["Territorio", "Empleado", "Mes"],
  promoters: ["Territorio", "Empleado", "Mes"],
  technical: ["Territorio", "Grupo Artículos", "Mes"],
  leads: ["Unidad de Negocio", "Empleado", "Mes"],
  farms: ["des_territorio", "atr_desc_empleado", "atr_cultivo_texto", "Mes"],
}

const cleanNumberText = text => String(text).replace(/[\s\u00a0]/g, "").replace(/^\$|^COP|\$$/gi, "").replace(/^\((.*)\)$/, "-$1").replace(/^-\$/, "-")

// Votes for the decimal separator using unambiguous values (both separators, repeated separators, or a separator not followed by exactly three digits).
export function detectDecimalSeparator(values) {
  let comma = 0, dot = 0, ambiguous = 0
  for (const value of values) {
    if (typeof value === "number" || value === null || value === undefined) continue
    const text = cleanNumberText(value).replace(/%$/, "")
    if (!text) continue
    const dots = (text.match(/\./g) ?? []).length, commas = (text.match(/,/g) ?? []).length
    if (dots && commas) text.lastIndexOf(",") > text.lastIndexOf(".") ? comma++ : dot++
    else if (dots > 1) comma++
    else if (commas > 1) dot++
    else if (dots === 1) /\.\d{3}$/.test(text) ? ambiguous++ : dot++
    else if (commas === 1) /,\d{3}$/.test(text) ? ambiguous++ : comma++
  }
  if (comma === dot) return { decimal: ",", ambiguous: ambiguous > 0 || comma > 0 }
  return { decimal: comma > dot ? "," : ".", ambiguous: false }
}

export function parseNumber(value, decimal = ",") {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN
  if (value === null || value === undefined) return null
  let text = cleanNumberText(value)
  if (!text) return null
  const percent = text.endsWith("%")
  if (percent) text = text.slice(0, -1)
  const thousands = decimal === "," ? "." : ","
  text = text.split(thousands).join("")
  if (decimal === ",") text = text.replace(",", ".")
  text = text.replace(/\.$/, "")
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return NaN
  return Number(text) / (percent ? 100 : 1)
}

export function rawNumber(value) {
  if (typeof value === "number") return value
  return parseNumber(value, detectDecimalSeparator([value]).decimal)
}

// Half of the last displayed unit: "11 %" can be any ratio in [10,5 %; 11,5 %).
function displayedHalfStep(value) {
  if (typeof value === "number") return 1e-9
  const text = cleanNumberText(value)
  const percent = text.endsWith("%")
  const digits = text.replace(/%$/, "").match(/[.,](\d+)$/)?.[1]?.length ?? 0
  return 0.5 * Math.pow(10, -digits) / (percent ? 100 : 1)
}

export function referenceCount(ratio, target, halfStep = 1e-9) {
  if (ratio === null || target === null || ratio === undefined || target === undefined) return { value: null, exact: true }
  const center = ratio * target
  const low = Math.max(0, (ratio - halfStep) * target), high = (ratio + halfStep) * target
  const candidates = []
  for (let n = Math.ceil(low - 1e-9); n <= Math.floor(high + 1e-9); n++) candidates.push(n)
  if (candidates.length === 1) return { value: candidates[0], exact: true }
  const nearest = Math.round(center)
  return { value: nearest, exact: Math.abs(center - nearest) < 1e-6 && halfStep < 1e-6 }
}

export function technicalReferenceCount(record) {
  return referenceCount(record["Referencias Recomendadas"], record["Meta Referencias"]).value
}

export function rowsFromText(text) {
  return parseDelimitedRows(text)
}

export function prepareAgricolaBlock(id, text, year, quarter) {
  const parsed = parseDelimitedRows(text)
  return prepareAgricolaRows(id, parsed.rows, year, quarter, { origin: "paste", errors: parsed.errors })
}

export function prepareAgricolaRows(id, matrix, year, quarter, { origin = "file", errors = [] } = {}) {
  const spec = AGRICOLA_BLOCKS.find(block => block.id === id)
  if (!spec) throw new Error("Bloque desconocido")
  const empty = { headers: [], rows: [], errors: [...errors], records: [], issues: [...errors], warnings: [], excluded: 0, summary: emptySummary(origin) }
  const rows = (matrix ?? []).filter(row => Array.isArray(row))
  if (!rows.some(row => row.some(value => value !== null && value !== undefined && String(value).trim()))) return empty
  const headerIndex = findHeaderRow(rows, spec.required)
  if (headerIndex < 0) {
    const first = rows.find(row => row.some(value => value !== null && String(value ?? "").trim())) ?? []
    const present = new Set(first.map(key))
    const missing = spec.required.filter(header => !present.has(key(header)))
    return { ...empty, issues: [...errors, ...(missing.length < spec.required.length ? missing.map(header => "Falta columna: " + header) : ["No se encontró la fila de encabezados. Copia desde la fila que contiene: " + spec.required.join(", ")])] }
  }
  const table = tableFromRows(rows, headerIndex, errors)
  const issues = [...table.errors], warnings = []
  if (headerIndex > 0) warnings.push(`Se omitieron ${headerIndex} filas anteriores a los encabezados.`)
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !QUARTER_MONTHS[quarter]) issues.push("Periodo inválido")
  const canonical = new Map(spec.required.map(header => [key(header), header]))
  const numericColumns = table.headers.map((header, index) => NUMERIC.has(key(header)) ? index : -1).filter(index => index >= 0)
  const separator = detectDecimalSeparator(table.rows.flatMap(row => numericColumns.map(index => row[index])))
  if (separator.ambiguous && origin === "paste") warnings.push(`No se pudo confirmar el separador decimal; se asumió "${separator.decimal}". Revisa los totales o carga el archivo .xlsx.`)
  const records = table.rows.map((row, rowIndex) => {
    const record = {}
    table.headers.forEach((header, index) => {
      const field = canonical.get(key(header)) ?? header.trim()
      const value = row[index]
      if (NUMERIC.has(key(header))) {
        const number = parseNumber(value, separator.decimal)
        record[field] = number
        if (Number.isNaN(number)) { issues.push(`Fila ${headerIndex + rowIndex + 2}: número inválido en ${header} (${value})`); record[field] = null }
        else if (number !== null && number < 0) issues.push(`Fila ${headerIndex + rowIndex + 2}: número negativo en ${header}`)
        if (key(header) === key("Referencias Recomendadas")) record.__refHalfStep = displayedHalfStep(value)
      } else record[field] = typeof value === "string" ? value.trim() : value
    })
    return record
  })
  if (spec.required.some(header => !canonical.has(key(header)))) issues.push("Configuración de columnas inválida")
  if (issues.length) return { ...table, records: [], issues, warnings, excluded: 0, summary: emptySummary(origin, table.rows.length) }

  if (id === "activities") {
    const selected = selectFieldActivities(records, { year, quarter, sourceKey: "PYC-AGR-ANT" })
    issues.push(...selected.issues.map(issue => "Actividad " + (issue.id ?? "fila " + (headerIndex + issue.row + 1)) + ": " + issue.reason))
    const accepted = selected.accepted.map(record => ({ ...Object.fromEntries(ACTIVITY_FIELDS.map(field => [field, record[field] ?? null])), month: record.month, year: record.year }))
    const byReason = count(selected.excluded, item => item.reason)
    const months = count(accepted, record => QUARTER_MONTHS[quarter][(record.month - 1) % 3])
    return { ...table, rows: [], records: accepted, issues, warnings, excluded: selected.excluded.length, summary: { origin, read: records.length, selected: accepted.length, excludedByReason: byReason, months, byType: count(accepted, record => record["Tipo de visita"]), blanks: {} } }
  }

  const quarterMonths = new Set(QUARTER_MONTHS[quarter].map(key))
  const allMonths = new Set(Object.values(QUARTER_MONTHS).flat().map(key))
  const excludedByReason = {}
  const selected = []
  for (const [index, record] of records.entries()) {
    const month = key(record.Mes)
    const unit = record["Unidad de Negocio"]
    const inUnit = unit ? key(unit) === "agricola antioquia" : key(record.Territorio).startsWith("pyc agricola ant")
    if (!allMonths.has(month)) { issues.push(`Fila ${headerIndex + index + 2}: mes no reconocido (${record.Mes ?? "vacío"})`); continue }
    if (!inUnit) { excludedByReason["Otra unidad de negocio"] = (excludedByReason["Otra unidad de negocio"] ?? 0) + 1; continue }
    if (!quarterMonths.has(month)) { excludedByReason["Mes fuera del periodo"] = (excludedByReason["Mes fuera del periodo"] ?? 0) + 1; continue }
    if (id === "technical") {
      const reference = referenceCount(record["Referencias Recomendadas"], record["Meta Referencias"], record.__refHalfStep)
      record["Cantidad referencias"] = reference.value
      if (!reference.exact && record.__refHalfStep > 1e-6) issues.push(`Fila ${headerIndex + index + 2}: "Referencias Recomendadas" no tiene decimales suficientes para obtener una cantidad exacta. Muestra más decimales en Excel antes de copiar o carga el archivo .xlsx.`)
    }
    delete record.__refHalfStep
    record.Mes = QUARTER_MONTHS[quarter].find(name => key(name) === month)
    selected.push(record)
  }
  const fields = IDENTITY[id]
  const seen = new Map()
  for (const record of selected) {
    const identity = fields.map(field => key(record[field])).join("|")
    if (seen.has(identity)) issues.push("Registro repetido: " + fields.map(field => record[field]).join(" / "))
    seen.set(identity, record)
  }
  warnings.push("El exportado no incluye año: se usa el año seleccionado.")
  for (const month of QUARTER_MONTHS[quarter]) if (!selected.some(record => record.Mes === month)) warnings.push("Sin registros de " + month + ": revisar si no hubo actividad o falta información.")
  const blanks = {}
  for (const header of table.headers) if (NUMERIC.has(key(header))) {
    const field = canonical.get(key(header)) ?? header.trim()
    const missing = selected.filter(record => record[field] === null).length
    if (missing) blanks[field] = missing
  }
  const summary = { origin, read: records.length, selected: selected.length, excludedByReason, months: count(selected, record => record.Mes), blanks }
  return { ...table, records: selected, issues, warnings, excluded: records.length - selected.length, summary }
}

function emptySummary(origin, read = 0) {
  return { origin, read, selected: 0, excludedByReason: {}, months: {}, blanks: {} }
}

function count(items, keyOf) {
  return items.reduce((result, item) => { const value = keyOf(item); result[value] = (result[value] ?? 0) + 1; return result }, {})
}

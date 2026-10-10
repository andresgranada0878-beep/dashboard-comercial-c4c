import { normalizeHeader } from "../pasted-table.mjs"

// Cartera municipal: SOLO determina la meta MENSUAL de cobertura de cada promotor activo; Q3 = x3.
// Se aceptan encabezados anteriores «Meta cobertura Q3» y «Meta visitas Q3» para evitar romper archivos ya cargados.
// La meta de visitas es independiente: 60 por mes (180 Q3).
// El fichero se carga localmente y no se versionan nombres ni carteras en GitHub.
export function prepareVisitTargetsRows(matrix) {
  const rows = (matrix ?? []).filter(Array.isArray)
  const key = value => normalizeHeader(value)
  const accepted = [key("Meta cobertura mensual"), key("Meta cobertura Q3"), key("Meta visitas Q3")]
  const head = rows.findIndex(row => row.some(value => key(value) === key("Promotor"))
    && row.some(value => accepted.includes(key(value))))
  if (head < 0) return { records: [], issues: ["Se requieren columnas «Promotor» y «Meta cobertura mensual» (se admiten también «Meta cobertura Q3» o «Meta visitas Q3» antiguas)."], summary: { read: 0, selected: 0 } }
  const names = rows[head].map(key)
  const nameAt = names.indexOf(key("Promotor")), targetAt = accepted.map(label => names.indexOf(label)).find(index => index >= 0)
  const records = [], issues = [], seen = new Set()
  let read = 0
  for (const [i, row] of rows.slice(head + 1).entries()) {
    const name = String(row[nameAt] ?? "").trim()
    const raw = row[targetAt]
    if (!name && (raw == null || raw === "")) continue
    read++
    if (!name) { issues.push(`Fila ${head + i + 2}: promotor vacío.`); continue }
    const id = key(name)
    if (seen.has(id)) { issues.push(`Promotor duplicado: ${name}.`); continue }
    seen.add(id)
    const num = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."))
    if (!Number.isInteger(num) || num <= 0) { issues.push(`Meta inválida de ${name}; debe ser entero positivo.`); continue }
    records.push({ Promotor: name, "Meta visitas Q3": num })
  }
  if (!records.length) issues.push("No hay metas válidas.")
  return { records, issues, summary: { read, selected: records.length } }
}

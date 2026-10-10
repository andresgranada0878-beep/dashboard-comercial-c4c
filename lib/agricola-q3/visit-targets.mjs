import { normalizeHeader } from "../pasted-table.mjs"

// Meta TRIMESTRAL de visitas, no cantidad de visitas realizadas ni meta de cobertura.
// El fichero se carga localmente y no se versionan nombres ni carteras en GitHub.
export function prepareVisitTargetsRows(matrix) {
  const rows = (matrix ?? []).filter(Array.isArray)
  const key = value => normalizeHeader(value)
  const head = rows.findIndex(row => row.some(value => key(value) === key("Promotor"))
    && row.some(value => key(value) === key("Meta visitas Q3")))
  if (head < 0) return { records: [], issues: ["Se requieren las columnas «Promotor» y «Meta visitas Q3»."], summary: { read: 0, selected: 0 } }
  const names = rows[head].map(key)
  const nameAt = names.indexOf(key("Promotor")), targetAt = names.indexOf(key("Meta visitas Q3"))
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

export const FIELD_ACTIVITY_TYPES = Object.freeze([
  "Día de campo", "Evento Especial", "Visita Mostrador Especial", "Visita Formación",
])
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
const allowed = new Set(FIELD_ACTIVITY_TYPES.map(normalize))

// Calendar components only: Excel serials and local export dates must not shift timezone.
export function activityDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 }
  const text = String(value ?? "").trim()
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial < 1 || serial > 100000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
  }
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/)
  let year, month, day
  if (match) [, year, month, day] = match.map(Number)
  else {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/)
    if (!match) return null
    ;[, day, month, year] = match.map(Number)
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return { year, month }
}

export function classifyTerritory(value) {
  const territory = normalize(value)
  if (territory.startsWith("pyc agricola ant")) return "PYC-AGR-ANT"
  if (territory.startsWith("galagro") && /\bnal\b/.test(territory)) return "GAL-NAC"
  if (territory.startsWith("galagro") && (/\bant\b/.test(territory) || territory.includes("antioquia"))) return "GAL-ANT"
  return null
}

export function selectFieldActivities(records, { year, quarter, sourceKey } = {}) {
  if (!Number.isInteger(year) || !/^Q[1-4]$/.test(quarter)) throw new Error("Periodo inválido")
  const firstMonth = (Number(quarter[1]) - 1) * 3 + 1
  const seen = new Map(), accepted = [], excluded = [], issues = []
  for (const [index, record] of records.entries()) {
    const id = String(record.ID ?? "").trim()
    const row = index + 1
    if (!id) { issues.push({ row, reason: "ID vacío" }); continue }
    const signature = JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
    if (seen.has(id)) {
      if (seen.get(id) !== signature) issues.push({ row, id, reason: "ID repetido con datos distintos" })
      else excluded.push({ row, id, reason: "Duplicado" })
      continue
    }
    seen.set(id, signature)
    const date = activityDate(record["Fecha/Hora de inicio"])
    if (!date) { issues.push({ row, id, reason: "Fecha de inicio inválida" }); continue }
    let reason
    if (date.year !== year || date.month < firstMonth || date.month >= firstMonth + 3) reason = "Fuera del periodo"
    else if (normalize(record.Estado) !== "completado") reason = "Actividad sin finalizar"
    else if (!allowed.has(normalize(record["Tipo de visita"]))) reason = "Tipo excluido"
    const unit = classifyTerritory(record["Territorio de ventas"])
    if (!reason && sourceKey && unit !== sourceKey) reason = "Otro canal"
    if (reason) excluded.push({ row, id, reason })
    else accepted.push({ ...record, sourceKey: unit, month: date.month, year: date.year })
  }
  // Conflicting duplicates cannot silently supply a valid result.
  const conflicts = new Set(issues.filter(issue => issue.reason === "ID repetido con datos distintos").map(issue => issue.id))
  return { accepted: accepted.filter(record => !conflicts.has(String(record.ID).trim())), excluded, issues }
}

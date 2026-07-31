// Utilidades de formato para la interfaz (español, es-CO).

export function formatPercent(value: number | null, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(value: number | null, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatSignedPercent(value: number | null, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const pts = value * 100
  const sign = pts > 0 ? "+" : ""
  return `${sign}${pts.toFixed(decimals)} pts`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

/** Nombre legible de un mes normalizado (YYYY-MM) o etiqueta libre. */
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

export function formatMonth(month: string | null): string {
  if (!month) return "—"
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (match) {
    const idx = Number(match[2]) - 1
    if (idx >= 0 && idx < 12) return `${MONTH_NAMES[idx]} ${match[1]}`
  }
  return month
}

export function formatMonthShort(month: string | null): string {
  const full = formatMonth(month)
  return full.length > 3 ? full.slice(0, 3) : full
}

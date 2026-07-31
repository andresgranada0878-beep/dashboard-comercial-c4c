import { EXCEL_ERROR_VALUES } from "@/config/excel-schema"
import { MONTH_ORDER } from "@/config/indicators"

export { canonical } from "@/config/companies"

/** Detecta si un valor es un error de fórmula de Excel. */
export function isExcelError(value: unknown): boolean {
  if (typeof value !== "string") return false
  const trimmed = value.trim().toUpperCase()
  return EXCEL_ERROR_VALUES.some((err) => trimmed === err.toUpperCase())
}

/**
 * Convierte cualquier valor de celda a número o null.
 * Maneja errores de Excel, celdas vacías, porcentajes como texto y separadores locales.
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (isExcelError(value)) return null

  let str = String(value).trim()
  if (!str || str === "-" || str.toLowerCase() === "n/a") return null

  const isPercent = str.includes("%")
  str = str.replace(/%/g, "").replace(/\s/g, "").replace(/[$€]/g, "")

  // Formato colombiano: miles con punto, decimales con coma (1.234,56).
  if (/,\d{1,2}$/.test(str) && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".")
  } else if (str.includes(",") && !str.includes(".")) {
    str = str.replace(",", ".")
  }

  const num = Number(str)
  if (Number.isNaN(num)) return null
  return isPercent ? num / 100 : num
}

/**
 * Convierte un cumplimiento a fracción. Acepta 0.7, "70%", 70 (asume porcentaje) o "0,7".
 */
export function parseFraction(value: unknown): number | null {
  const num = parseNumber(value)
  if (num === null) return null
  // Si viene como porcentaje entero (> 1.5 y sin decimales típicos), lo tratamos como %.
  if (num > 1.5) return num / 100
  return num
}

const MONTH_ALIASES: Record<string, string> = {
  ene: "Enero",
  enero: "Enero",
  jan: "Enero",
  january: "Enero",
  feb: "Febrero",
  febrero: "Febrero",
  february: "Febrero",
  mar: "Marzo",
  marzo: "Marzo",
  march: "Marzo",
  abr: "Abril",
  abril: "Abril",
  apr: "Abril",
  april: "Abril",
  may: "Mayo",
  mayo: "Mayo",
  jun: "Junio",
  junio: "Junio",
  june: "Junio",
  jul: "Julio",
  julio: "Julio",
  july: "Julio",
  ago: "Agosto",
  agosto: "Agosto",
  aug: "Agosto",
  august: "Agosto",
  sep: "Septiembre",
  septiembre: "Septiembre",
  september: "Septiembre",
  oct: "Octubre",
  octubre: "Octubre",
  october: "Octubre",
  nov: "Noviembre",
  noviembre: "Noviembre",
  november: "Noviembre",
  dic: "Diciembre",
  diciembre: "Diciembre",
  dec: "Diciembre",
  december: "Diciembre",
}

/** Normaliza un nombre de mes en español (mayúsculas, minúsculas, inglés, abreviado). */
export function normalizeMonth(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const key = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
  if (!key) return null
  if (MONTH_ALIASES[key]) return MONTH_ALIASES[key]
  const short = key.slice(0, 3)
  return MONTH_ALIASES[short] ?? null
}

export function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))
}

/** División segura que evita divisiones por cero. */
export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null
  if (denominator === 0) return null
  return numerator / denominator
}

/** Limpia texto: recorta espacios y colapsa múltiples espacios. */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (isExcelError(value)) return null
  const str = String(value).replace(/\s+/g, " ").trim()
  return str.length ? str : null
}

/** Construye un nombre de archivo seguro eliminando caracteres inválidos. */
export function cleanFileName(parts: string[]): string {
  const raw = parts
    .filter(Boolean)
    .join("_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
  return raw || "Resumen_C4C"
}

/** Identificador estable a partir de un nombre (para cruces y llaves de React). */
export function toId(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

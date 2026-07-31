import { read } from "xlsx"
import { DEFAULT_EXCEL_NAME, DEFAULT_EXCEL_PATH } from "@/config/excel-schema"
import { normalizeWorkbook } from "@/lib/excel-normalizer"
import type { NormalizedDashboardData } from "@/types/dashboard"

/**
 * Carga el archivo por defecto alojado en la aplicación.
 * Agrega un parámetro de actualización para evitar el uso de caché.
 */
export async function loadDefaultExcel(): Promise<NormalizedDashboardData> {
  const url = `${DEFAULT_EXCEL_PATH}?t=${Date.now()}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`No fue posible cargar el archivo predeterminado (HTTP ${res.status}).`)
  }
  const buffer = await res.arrayBuffer()
  const wb = read(buffer, { cellDates: true })
  return normalizeWorkbook(wb, { fileName: DEFAULT_EXCEL_NAME, source: "default" })
}

/** Carga un archivo Excel seleccionado por el usuario. */
export async function loadExcelFromFile(file: File): Promise<NormalizedDashboardData> {
  const validExtension = /\.xlsx$/i.test(file.name)
  if (!validExtension) {
    throw new Error("El archivo debe tener formato .xlsx.")
  }
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { cellDates: true })
  return normalizeWorkbook(wb, { fileName: file.name, source: "upload" })
}

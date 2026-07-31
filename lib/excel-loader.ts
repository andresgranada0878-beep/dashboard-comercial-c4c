import { readFile } from "node:fs/promises"
import path from "node:path"
import { read } from "xlsx"
import { DEFAULT_EXCEL_NAME } from "@/config/excel-schema"
import { normalizeWorkbook } from "@/lib/excel-normalizer"
import type { NormalizedDashboardData } from "@/types/dashboard"

/**
 * Carga el archivo por defecto alojado en la aplicación (lectura desde el sistema
 * de archivos del servidor, no por HTTP).
 */
export async function loadDefaultExcel(): Promise<NormalizedDashboardData> {
  const filePath = path.join(process.cwd(), "public", "data", "informe-c4c.xlsx")
  const buffer = await readFile(filePath)
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

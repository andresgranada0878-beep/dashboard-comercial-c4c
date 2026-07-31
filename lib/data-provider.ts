import { loadDefaultExcel, loadExcelFromFile } from "@/lib/excel-loader"
import type { DashboardDataProvider, NormalizedDashboardData } from "@/types/dashboard"

/**
 * Proveedor de datos basado en Excel. Implementa el contrato DashboardDataProvider
 * para permitir cambiar la fuente en el futuro sin rediseñar el dashboard.
 */
export class ExcelDashboardDataProvider implements DashboardDataProvider {
  private readonly file?: File

  constructor(file?: File) {
    this.file = file
  }

  load(): Promise<NormalizedDashboardData> {
    return this.file ? loadExcelFromFile(this.file) : loadDefaultExcel()
  }
}

/**
 * Preparado para el futuro: proveedor desde una API interna.
 * No implementa conexiones reales que requieran credenciales todavía.
 */
export class ApiDashboardDataProvider implements DashboardDataProvider {
  load(): Promise<NormalizedDashboardData> {
    return Promise.reject(new Error("ApiDashboardDataProvider aún no está implementado."))
  }
}

/**
 * Preparado para el futuro: proveedor desde Power BI.
 * No implementa conexiones reales que requieran credenciales todavía.
 */
export class PowerBIDashboardDataProvider implements DashboardDataProvider {
  load(): Promise<NormalizedDashboardData> {
    return Promise.reject(new Error("PowerBIDashboardDataProvider aún no está implementado."))
  }
}

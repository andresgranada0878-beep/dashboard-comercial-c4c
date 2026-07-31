// Tipos centrales del dashboard de indicadores C4C.
// La interfaz visual nunca lee el Excel directamente: consume estos tipos ya normalizados.

export type CompanyKey = "perez-cardona" | "galagro" | "tierragro"

export type IndicatorKey =
  | "ejecucionVisitas"
  | "coberturaClientes"
  | "nuevosClientes"
  | "recomendaciones"
  | "referencias"
  | "leadsCalificados"
  | "leadsCalificadosATiempo"
  | "impactoClientes"
  | "hectareasCultivos"
  | "cultivosImpactados"

export type IndicatorUnit = "count" | "currency" | "hectares" | "crops" | "percent"

export type PerformanceLevelKey = "requiere-mejora" | "en-desarrollo" | "destacado" | "excelente"

export type DataQualitySeverity = "ok" | "sin-info" | "warning"

/** Definición estática de un indicador (nombre, peso, límite, criterio). */
export interface IndicatorDefinition {
  key: IndicatorKey
  label: string
  shortLabel: string
  order: number
  defaultWeight: number
  /** Máximo reconocido visualmente (1 = 100%, 1.5 = 150%). */
  maxRecognized: number
  unit: IndicatorUnit
  icon: string
  definition: string
  formula: string
  criterio: string
}

export interface PerformanceLevel {
  key: PerformanceLevelKey
  label: string
  /** Umbral inferior inclusive, expresado en fracción (0.6 = 60%). */
  min: number
  /** Token de color (variable CSS). */
  colorVar: string
  hex: string
}

/** Empresa configurada con sus reglas de identificación. */
export interface CompanyConfig {
  key: CompanyKey
  name: string
  shortName: string
  logo: string
  /** Alias de nombre / organización que identifican la empresa. */
  aliases: string[]
  /** Prefijos de territorio que pertenecen a la empresa. */
  territoryPrefixes: string[]
}

/** Un indicador resuelto para un comercial concreto, tal como viene del Excel. */
export interface AdvisorIndicator {
  key: IndicatorKey
  label: string
  /** Cumplimiento calculado en el Excel (puede venir nulo o con error). */
  cumplimientoExcel: number | null
  meta: number | null
  peso: number | null
  pesoAjustado: number | null
  metaEsperada: number | null
  /** Gestión real por mes normalizado. */
  gestion: Record<string, number | null>
  quality: DataQualitySeverity
}

export interface Advisor {
  id: string
  name: string
  cargo: string | null
  empresa: CompanyKey | null
  unidad: string | null
  territorio: string | null
  indicators: AdvisorIndicator[]
}

export interface TerritoryMeta {
  territorio: string
  empresa: CompanyKey | null
  unidad: string | null
  responsable: string | null
  ciudades: string[]
  totalClientes: number | null
  metaClientes: number | null
}

export interface NarrativeEntry {
  tipo: "resumen" | "fortalezas" | "oportunidades"
  /** Umbral (fracción) o etiqueta ">90%" normalizada a fracción cuando aplica. */
  min: number
  mensaje: string
}

export interface ActivityRecord {
  id: string
  estado: string | null
  asunto: string | null
  cliente: string | null
  tipoVisita: string | null
  propietario: string | null
  territorio: string | null
  organizacion: string | null
  empresa: CompanyKey | null
  ciudad: string | null
  cultivo: string | null
  hectareas: number | null
  mes: string | null
}

/** Reporte de calidad de datos para el panel desplegable. */
export interface DataQualityReport {
  sheetsFound: string[]
  sheetsMissing: string[]
  columnsMissing: { sheet: string; columns: string[] }[]
  recordsProcessed: number
  recordsDiscarded: number
  errors: string[]
  warnings: string[]
  updatedAt: string
  status: "ok" | "warning" | "error"
}

export interface DataSourceMeta {
  fileName: string
  loadedAt: string
  source: "default" | "upload"
}

/** Estructura normalizada completa que consume toda la interfaz. */
export interface NormalizedDashboardData {
  advisors: Advisor[]
  companies: CompanyKey[]
  months: string[]
  quarters: string[]
  years: number[]
  territories: TerritoryMeta[]
  narratives: NarrativeEntry[]
  activities: ActivityRecord[]
  meta: DataSourceMeta
  quality: DataQualityReport
}

// ---- Resultados calculados (motor de indicadores) ----

export interface IndicatorResult {
  key: IndicatorKey
  label: string
  shortLabel: string
  gestion: number | null
  metaEsperada: number | null
  /** Cumplimiento sin limitar. */
  cumplimiento: number | null
  /** Cumplimiento limitado al máximo reconocido. */
  cumplimientoReconocido: number | null
  peso: number
  aporte: number | null
  maxRecognized: number
  level: PerformanceLevelKey | null
  quality: DataQualitySeverity
  /** Gestión por mes (para evolución y detalle). */
  gestionMensual: Record<string, number | null>
  incluido: boolean
}

export interface AggregatedResult {
  /** Resultado global en fracción (0.87 = 87%). */
  global: number | null
  level: PerformanceLevelKey | null
  indicators: IndicatorResult[]
  advisorsCount: number
  territoriesCount: number
  unidadesCount: number
  /** Indicadores excluidos por falta de información. */
  excluidos: string[]
}

// ---- Filtros ----

export interface DashboardFilters {
  empresa: CompanyKey | null
  unidad: string | null
  territorio: string | null
  asesor: string | null
  cargo: string | null
  anio: number | null
  trimestre: string | null
  mes: string | null
  nivel: PerformanceLevelKey | null
}

export type ReportView =
  | "resumen-ejecutivo"
  | "unidad-negocio"
  | "territorio"
  | "asesor"
  | "evolucion-mensual"
  | "detalle-indicadores"
  | "calidad-datos"

/** Contrato de proveedor de datos (Excel hoy, API/PowerBI a futuro). */
export interface DashboardDataProvider {
  load(): Promise<NormalizedDashboardData>
}

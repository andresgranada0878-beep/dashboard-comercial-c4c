import { INDICATOR_DEFINITIONS, INDICATOR_MAP, PERFORMANCE_LEVELS } from "@/config/indicators"
import type { DashboardFilters, IndicatorKey, PerformanceLevelKey } from "@/types/dashboard"
import type { IndicatorSourceRecord } from "@/lib/indicator-extractor"

export interface IndicatorResultItem {
  id: string
  nombre: string
  gestionReal: number | null
  meta: number | null
  cumplimientoReal: number | null
  cumplimientoReconocido: number | null
  peso: number
  aportePonderado: number | null
  empresa: string | null
  unidadNegocio: string | null
  territorio: string | null
  asesor: string | null
  cargo: string | null
  anio: number | null
  trimestre: string | null
  mes: string | null
  hojaFuente: string
  estadoCalidad: "ok" | "sin-info" | "warning"
  advertencias: string[]
  indicadorKey: IndicatorKey
}

export interface IndicatorCalculationSummary {
  cantidadRegistrosPorIndicador: Record<string, number>
  indicadoresCalculados: string[]
  indicadoresSinInformacion: string[]
  errores: string[]
  advertencias: string[]
  resultadoGlobalPrueba: number | null
}

export function getPerformanceLevelName(value: number | null): string {
  if (value === null) return "Sin información"
  if (value < 0.6) return "Requiere mejora"
  if (value < 0.75) return "En desarrollo"
  if (value < 0.9) return "Destacado"
  return "Excelente"
}

export function getPerformanceLevelKey(value: number | null): PerformanceLevelKey | null {
  if (value === null) return null
  if (value < 0.6) return "requiere-mejora"
  if (value < 0.75) return "en-desarrollo"
  if (value < 0.9) return "destacado"
  return "excelente"
}

export function applyFilter(records: IndicatorSourceRecord[], filters: DashboardFilters): IndicatorSourceRecord[] {
  return records.filter((record) => {
    if (filters.empresa && record.empresa !== filters.empresa) return false
    if (filters.unidad && record.unidadNegocio !== filters.unidad) return false
    if (filters.territorio && record.territorio !== filters.territorio) return false
    if (filters.asesor && record.asesor !== filters.asesor) return false
    if (filters.cargo && record.cargo !== filters.cargo) return false
    if (filters.anio !== null && record.anio !== filters.anio) return false
    if (filters.trimestre && record.trimestre !== filters.trimestre) return false
    if (filters.mes && record.mes !== filters.mes) return false
    return true
  })
}

export function calculateIndicatorResults(records: IndicatorSourceRecord[], filters?: DashboardFilters): IndicatorResultItem[] {
  const filtered = filters ? applyFilter(records, filters) : records

  return filtered.map((record) => {
    const definition = INDICATOR_MAP[record.indicatorKey]
    const rawCompliance = record.cumplimientoReal
    const recognized = rawCompliance === null ? null : Math.min(Math.max(rawCompliance, 0), definition.maxRecognized)
    const weight = record.peso ?? definition.defaultWeight
    const aporte = recognized === null || weight === null ? null : recognized * weight

    return {
      id: record.id,
      nombre: record.name,
      gestionReal: record.gestionReal,
      meta: record.meta,
      cumplimientoReal: rawCompliance,
      cumplimientoReconocido: recognized,
      peso: weight,
      aportePonderado: aporte,
      empresa: record.empresa,
      unidadNegocio: record.unidadNegocio,
      territorio: record.territorio,
      asesor: record.asesor,
      cargo: record.cargo,
      anio: record.anio,
      trimestre: record.trimestre,
      mes: record.mes,
      hojaFuente: record.hojaFuente,
      estadoCalidad: record.calidadDato,
      advertencias: record.advertencias,
      indicadorKey: record.indicatorKey,
    }
  })
}

export function summarizeIndicatorMetrics(records: IndicatorSourceRecord[], filters?: DashboardFilters): IndicatorCalculationSummary {
  const results = calculateIndicatorResults(records, filters)
  const byIndicator = Object.fromEntries(INDICATOR_DEFINITIONS.map((indicator) => [indicator.key, 0])) as Record<string, number>

  for (const item of results) {
    byIndicator[item.indicadorKey] = (byIndicator[item.indicadorKey] ?? 0) + 1
  }

  const indicatorsCalculados = results
    .filter((item) => item.cumplimientoReal !== null)
    .map((item) => item.nombre)
  const indicatorsSinInformacion = INDICATOR_DEFINITIONS
    .filter((indicator) => !results.some((item) => item.indicadorKey === indicator.key && item.cumplimientoReal !== null))
    .map((indicator) => indicator.label)

  const errores = results
    .filter((item) => item.cumplimientoReal === null || item.gestionReal === null || item.meta === null)
    .map((item) => `${item.nombre}: sin información suficiente`)

  const advertencias = results.flatMap((item) => item.advertencias.map((warning) => `${item.nombre}: ${warning}`))

  const resultadoGlobalPrueba = results.reduce((sum, item) => {
    if (item.cumplimientoReconocido === null) return sum
    return sum + item.cumplimientoReconocido * item.peso
  }, 0)

  return {
    cantidadRegistrosPorIndicador: byIndicator,
    indicadoresCalculados: [...new Set(indicatorsCalculados)],
    indicadoresSinInformacion: [...new Set(indicatorsSinInformacion)],
    errores: [...new Set(errores)],
    advertencias: [...new Set(advertencias)],
    resultadoGlobalPrueba: Number.isFinite(resultadoGlobalPrueba) ? resultadoGlobalPrueba : null,
  }
}

export function buildGlobalResult(records: IndicatorSourceRecord[], filters?: DashboardFilters): number | null {
  const results = calculateIndicatorResults(records, filters)
  const total = results.reduce((acc, item) => {
    if (item.cumplimientoReconocido === null) return acc
    return acc + item.cumplimientoReconocido * item.peso
  }, 0)

  return total > 0 ? total : null
}

export function getFilteredResults(records: IndicatorSourceRecord[], filters: DashboardFilters): IndicatorResultItem[] {
  return calculateIndicatorResults(records, filters)
}

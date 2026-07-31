import { INDICATOR_DEFINITIONS, QUARTER_MONTHS, getPerformanceLevel } from "@/config/indicators"
import { safeDivide } from "@/lib/data-validation"
import type {
  Advisor,
  AggregatedResult,
  DashboardFilters,
  IndicatorResult,
  NormalizedDashboardData,
  PerformanceLevelKey,
} from "@/types/dashboard"

/** Meses del trimestre disponibles en los datos. */
export function quarterMonths(quarter: string, availableMonths: string[]): string[] {
  const config = QUARTER_MONTHS[quarter] ?? []
  const inData = config.filter((m) => availableMonths.includes(m))
  return inData.length ? inData : availableMonths
}

/** Trimestre más reciente disponible. */
export function latestQuarter(data: NormalizedDashboardData): string | null {
  if (!data.quarters.length) return null
  return [...data.quarters].sort().at(-1) ?? null
}

/** Meses seleccionados según los filtros (mes puntual o trimestre completo). */
export function resolveSelectedMonths(
  filters: DashboardFilters,
  data: NormalizedDashboardData,
): { months: string[]; quarterMonthCount: number } {
  const quarter = filters.trimestre ?? latestQuarter(data) ?? data.quarters[0]
  const qMonths = quarter ? quarterMonths(quarter, data.months) : data.months
  const quarterMonthCount = qMonths.length || 1
  if (filters.mes && qMonths.includes(filters.mes)) {
    return { months: [filters.mes], quarterMonthCount }
  }
  return { months: qMonths, quarterMonthCount }
}

/** Aplica los filtros jerárquicos a la lista de comerciales. */
export function filterAdvisors(advisors: Advisor[], filters: DashboardFilters): Advisor[] {
  return advisors.filter((a) => {
    if (filters.empresa && a.empresa !== filters.empresa) return false
    if (filters.unidad && a.unidad !== filters.unidad) return false
    if (filters.territorio && a.territorio !== filters.territorio) return false
    if (filters.asesor && a.id !== filters.asesor) return false
    if (filters.cargo && a.cargo !== filters.cargo) return false
    return true
  })
}

function modeWeight(advisors: Advisor[], indicatorKey: string, fallback: number): number {
  const counts = new Map<number, number>()
  for (const a of advisors) {
    const ind = a.indicators.find((i) => i.key === indicatorKey)
    if (ind?.peso != null && ind.peso > 0) {
      counts.set(ind.peso, (counts.get(ind.peso) ?? 0) + 1)
    }
  }
  let best = fallback
  let bestCount = 0
  for (const [w, c] of counts) {
    if (c > bestCount) {
      best = w
      bestCount = c
    }
  }
  return best
}

/**
 * Motor principal: agrega un conjunto de comerciales para los meses seleccionados.
 * Fórmula: cumplimiento = suma(gestión) / (suma(meta esperada) * factor mensual),
 * limitado al máximo reconocido. Resultado global = suma(cumplimiento reconocido * peso).
 */
export function aggregate(
  advisors: Advisor[],
  selectedMonths: string[],
  quarterMonthCount: number,
): AggregatedResult {
  const metaFactor = Math.min(1, selectedMonths.length / (quarterMonthCount || 1))
  const singleAdvisor = advisors.length === 1

  const indicators: IndicatorResult[] = INDICATOR_DEFINITIONS.map((def) => {
    let sumGestion = 0
    let sumMeta = 0
    let hasGestion = false
    let hasMeta = false
    const gestionMensual: Record<string, number | null> = {}

    for (const a of advisors) {
      const ind = a.indicators.find((i) => i.key === def.key)
      if (!ind) continue
      for (const month of selectedMonths) {
        const value = ind.gestion[month]
        if (value != null) {
          sumGestion += value
          hasGestion = true
          gestionMensual[month] = (gestionMensual[month] ?? 0) + value
        }
      }
      if (ind.metaEsperada != null && ind.metaEsperada > 0) {
        sumMeta += ind.metaEsperada
        hasMeta = true
      }
    }

    const metaPeriodo = hasMeta ? sumMeta * metaFactor : null
    let cumplimiento = safeDivide(hasGestion ? sumGestion : null, metaPeriodo)

    // Respaldo: usar el cumplimiento del Excel cuando no puede calcularse y hay un solo comercial.
    if (cumplimiento === null && singleAdvisor) {
      const ind = advisors[0].indicators.find((i) => i.key === def.key)
      if (ind?.cumplimientoExcel != null) cumplimiento = ind.cumplimientoExcel
    }

    const cumplimientoReconocido =
      cumplimiento === null ? null : Math.max(0, Math.min(cumplimiento, def.maxRecognized))
    const peso = modeWeight(advisors, def.key, def.defaultWeight)
    const incluido = cumplimiento !== null
    const aporte = incluido && cumplimientoReconocido !== null ? cumplimientoReconocido * peso : null
    const level = getPerformanceLevel(cumplimientoReconocido)

    return {
      key: def.key,
      label: def.label,
      shortLabel: def.shortLabel,
      gestion: hasGestion ? sumGestion : null,
      metaEsperada: metaPeriodo,
      cumplimiento,
      cumplimientoReconocido,
      peso,
      aporte,
      maxRecognized: def.maxRecognized,
      level: level?.key ?? null,
      quality: incluido ? "ok" : "sin-info",
      gestionMensual,
      incluido,
    }
  })

  const included = indicators.filter((i) => i.incluido && i.aporte !== null)
  const global = included.length ? included.reduce((sum, i) => sum + (i.aporte ?? 0), 0) : null
  const level = getPerformanceLevel(global)

  return {
    global,
    level: level?.key ?? null,
    indicators,
    advisorsCount: advisors.length,
    territoriesCount: new Set(advisors.map((a) => a.territorio).filter(Boolean)).size,
    unidadesCount: new Set(advisors.map((a) => a.unidad).filter(Boolean)).size,
    excluidos: indicators.filter((i) => !i.incluido).map((i) => i.label),
  }
}

/** Resultado global (fracción) para un conjunto de comerciales en meses dados. */
export function globalForMonths(
  advisors: Advisor[],
  months: string[],
  quarterMonthCount: number,
): number | null {
  return aggregate(advisors, months, quarterMonthCount).global
}

/** Variación frente al mes anterior del trimestre (puntos porcentuales). */
export function monthOverMonthVariation(
  advisors: Advisor[],
  quarterMonths: string[],
  currentMonth: string | null,
): number | null {
  if (!currentMonth) return null
  const idx = quarterMonths.indexOf(currentMonth)
  if (idx <= 0) return null
  const prevMonth = quarterMonths[idx - 1]
  const current = globalForMonths(advisors, [currentMonth], quarterMonths.length)
  const previous = globalForMonths(advisors, [prevMonth], quarterMonths.length)
  if (current === null || previous === null) return null
  return current - previous
}

export function levelLabel(key: PerformanceLevelKey | null): string {
  switch (key) {
    case "excelente":
      return "Excelente"
    case "destacado":
      return "Destacado"
    case "en-desarrollo":
      return "En desarrollo"
    case "requiere-mejora":
      return "Requiere mejora"
    default:
      return "Sin información"
  }
}

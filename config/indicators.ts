import type { IndicatorDefinition, IndicatorKey, PerformanceLevel } from "@/types/dashboard"

// Orden fijo de presentación (NO es un ranking). Centraliza pesos y límites reconocidos.
export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  {
    key: "ejecucionVisitas",
    label: "Ejecución de visitas",
    shortLabel: "Ejec. visitas",
    order: 1,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "route",
    definition: "Mide el cumplimiento de la meta de visitas comerciales realizadas en el periodo.",
    formula: "Cumplimiento = cantidad de visitas realizadas / meta de visitas.",
    criterio: "Se reconoce hasta el 100%. Considera únicamente visitas efectivamente ejecutadas.",
  },
  {
    key: "coberturaClientes",
    label: "Cobertura de clientes",
    shortLabel: "Cobertura",
    order: 2,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "users",
    definition: "Porcentaje de clientes de la base que fueron visitados en el periodo.",
    formula: "Cumplimiento = clientes visitados / meta de cobertura.",
    criterio: "Se reconoce hasta el 100% de la meta de cobertura definida por territorio.",
  },
  {
    key: "nuevosClientes",
    label: "Nuevos clientes",
    shortLabel: "Nuevos clientes",
    order: 3,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "user-plus",
    definition: "Clientes nuevos o recuperados frente a la meta de recuperación.",
    formula: "Cumplimiento = clientes nuevos / meta de clientes por recuperar.",
    criterio: "Se reconoce hasta el 100% de la meta de recuperación.",
  },
  {
    key: "recomendaciones",
    label: "Recomendaciones",
    shortLabel: "Recomendaciones",
    order: 4,
    defaultWeight: 0.2,
    maxRecognized: 1,
    unit: "currency",
    icon: "clipboard-check",
    definition: "Valor de recomendaciones técnicas frente al presupuesto asignado.",
    formula: "Cumplimiento = valor de recomendaciones / presupuesto.",
    criterio: "Indicador de mayor peso. Se reconoce hasta el 100% del presupuesto.",
  },
  {
    key: "referencias",
    label: "Referencias",
    shortLabel: "Referencias",
    order: 5,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "list-checks",
    definition: "Referencias recomendadas frente a la meta de referencias.",
    formula: "Cumplimiento = referencias recomendadas / meta de referencias.",
    criterio: "Se reconoce hasta el 100% de la meta de referencias.",
  },
  {
    key: "leadsCalificados",
    label: "Leads calificados",
    shortLabel: "Leads calif.",
    order: 6,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "filter",
    definition: "Leads calificados frente a la meta de leads del periodo.",
    formula: "Cumplimiento = leads calificados / meta de leads.",
    criterio: "Se reconoce hasta el 100% de la meta de leads.",
  },
  {
    key: "leadsCalificadosATiempo",
    label: "Leads calificados a tiempo",
    shortLabel: "Leads a tiempo",
    order: 7,
    defaultWeight: 0.1,
    maxRecognized: 1,
    unit: "count",
    icon: "clock",
    definition: "Leads calificados dentro del tiempo esperado de gestión.",
    formula: "Cumplimiento = leads calificados a tiempo / meta de leads.",
    criterio: "Se reconoce hasta el 100%. Penaliza la gestión fuera de tiempo.",
  },
  {
    key: "impactoClientes",
    label: "Impacto en clientes",
    shortLabel: "Impacto clientes",
    order: 8,
    defaultWeight: 0.1,
    maxRecognized: 1.5,
    unit: "count",
    icon: "sprout",
    definition: "Impacto en clientes mediante actividades de campo (parcelas y actividades).",
    formula: "Cumplimiento = actividades ejecutadas / meta de actividades.",
    criterio: "Se reconoce hasta el 150% por su naturaleza de gestión de campo.",
  },
  {
    key: "hectareasCultivos",
    label: "Hectáreas de cultivos impactados",
    shortLabel: "Hectáreas",
    order: 9,
    defaultWeight: 0.05,
    maxRecognized: 1.5,
    unit: "hectares",
    icon: "land-plot",
    definition: "Hectáreas de cultivos impactados frente a la meta de hectáreas.",
    formula: "Cumplimiento = hectáreas impactadas / meta de hectáreas.",
    criterio: "Se reconoce hasta el 150%. Forma parte de la gestión de cultivos impactados.",
  },
  {
    key: "cultivosImpactados",
    label: "Cultivos impactados",
    shortLabel: "Cultivos",
    order: 10,
    defaultWeight: 0.05,
    maxRecognized: 1.5,
    unit: "crops",
    icon: "leaf",
    definition: "Cantidad de cultivos impactados frente a la meta de cultivos.",
    formula: "Cumplimiento = cultivos impactados / meta de cultivos.",
    criterio: "Se reconoce hasta el 150%. Forma parte de la gestión de cultivos impactados.",
  },
]

export const INDICATOR_MAP: Record<IndicatorKey, IndicatorDefinition> = INDICATOR_DEFINITIONS.reduce(
  (acc, def) => {
    acc[def.key] = def
    return acc
  },
  {} as Record<IndicatorKey, IndicatorDefinition>,
)

// Agrupación visual "Gestión de cultivos impactados".
export const CULTIVOS_GROUP: IndicatorKey[] = ["hectareasCultivos", "cultivosImpactados"]

// Meta de referencia general (90%).
export const REFERENCE_GOAL = 0.9

// Rangos de desempeño (fracción).
export const PERFORMANCE_LEVELS: PerformanceLevel[] = [
  { key: "requiere-mejora", label: "Requiere mejora", min: 0, colorVar: "var(--critical)", hex: "#c2413b" },
  { key: "en-desarrollo", label: "En desarrollo", min: 0.6, colorVar: "var(--warning)", hex: "#d97706" },
  { key: "destacado", label: "Destacado", min: 0.75, colorVar: "var(--green)", hex: "#4f8a5b" },
  { key: "excelente", label: "Excelente", min: 0.9, colorVar: "var(--green-dark)", hex: "#245c3a" },
]

/** Devuelve el nivel de desempeño para un cumplimiento en fracción. */
export function getPerformanceLevel(value: number | null): PerformanceLevel | null {
  if (value === null || Number.isNaN(value)) return null
  let match = PERFORMANCE_LEVELS[0]
  for (const level of PERFORMANCE_LEVELS) {
    if (value >= level.min) match = level
  }
  return match
}

// Meses por trimestre (configurable). Permite recalcular la meta proporcional por mes.
export const QUARTER_MONTHS: Record<string, string[]> = {
  "Trimestre 1": ["Enero", "Febrero", "Marzo"],
  "Trimestre 2": ["Abril", "Mayo", "Junio"],
  "Trimestre 3": ["Julio", "Agosto", "Septiembre"],
  "Trimestre 4": ["Octubre", "Noviembre", "Diciembre"],
}

export const MONTH_ORDER = [
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

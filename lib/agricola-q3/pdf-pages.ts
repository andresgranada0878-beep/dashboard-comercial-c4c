import type { IndividualPdfPage } from "@/lib/pdf/export-individual-pdf"
import type { IndividualIndicator, IndividualSource, MonthlyIndicatorValue, QuarterIndicatorValue } from "@/types/individual-dashboard"
import type { AgricolaReports, EntityPeriodSummary, PeriodStatus, Q3Entity } from "./engine.mjs"

export const STATUS_LABELS: Record<PeriodStatus, string> = {
  ok: "Completo",
  parcial: "Parcial",
  sin_dato: "Sin dato",
  sin_meta: "Sin meta",
  no_aplica: "No aplica",
}

export const KIND_TITLES: Record<Q3Entity["kind"], string> = {
  individual: "Informe individual de indicadores C4C",
  territorio: "Informe por territorio de indicadores C4C",
  direccion: "Informe de dirección de indicadores C4C",
}

// jsPDF's built-in Helvetica only covers WinAnsi; other characters print garbled.
function pdfText(value: string) {
  return value
    .replace(/Σ\s*/g, "Suma de ")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
}

export function formatShare(value: number) {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value * 100)} %`
}

const oneDecimal = (value: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)

export const PARTIAL_LEVEL = "PARCIAL · Sin nivel de desempeño"

export function partialDetail(summary: EntityPeriodSummary) {
  return summary.evaluatedWeight < summary.totalWeight - 1e-9 ? "peso evaluado < 100 %" : "datos incompletos en algún indicador"
}

export const NOT_APPLICABLE_LEVEL = "NO APLICA · Territorio sin titular activo"

export function incompleteLevel(summary: EntityPeriodSummary) {
  return summary.applicable ? `${PARTIAL_LEVEL} (${partialDetail(summary)})` : NOT_APPLICABLE_LEVEL
}

export function partialReason(summary: EntityPeriodSummary) {
  if (summary.complete) return null
  if (!summary.applicable) return "NO APLICA (territorio sin titular activo)"
  return `PARCIAL (${partialDetail(summary)})`
}

export function formatPoints(value: number | null) {
  if (value === null) return "Sin resultado"
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)} puntos`
}

export function resultLabel(entity: Q3Entity, period: string) {
  const summary = entity.results[period]
  if (!summary.applicable) return "No aplica"
  if (summary.result === null) return "Sin resultado"
  const value = `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(summary.result * 100)} %`
  if (summary.complete) return value
  return `PARCIAL: ${oneDecimal(summary.result)} / 100 puntos; ${normalizedLabel(entity, period)}`
}

export function normalizedLabel(entity: Q3Entity, period: string) {
  const summary = entity.results[period]
  if (!summary.applicable) return "No aplica"
  if (summary.normalized === null) return "Sin resultado"
  return `${oneDecimal(summary.normalized)} % sobre ${formatShare(summary.evaluatedWeight)} evaluado`
}

export function toIndividualSource(entity: Q3Entity, reports: AgricolaReports, loadedAt: string): IndividualSource {
  const indicators: IndividualIndicator[] = entity.indicators.map((indicator, index) => {
    const monthly: MonthlyIndicatorValue[] = reports.months.map((month) => {
      const value = indicator.periods[month]
      return { month, actual: value.actual, target: value.target, rawCompliance: value.rawCompliance, recognizedCompliance: value.recognizedCompliance, contribution: value.contribution }
    })
    const q = indicator.periods[reports.quarter]
    const quarter: QuarterIndicatorValue = { actual: q.actual, target: q.target, rawCompliance: q.rawCompliance, recognizedCompliance: q.recognizedCompliance, contribution: q.contribution }
    return {
      id: indicator.id, label: indicator.label, row: index + 1, calculationType: indicator.calculationType, formula: indicator.formula,
      weight: indicator.weight, cap: indicator.cap, targetThreshold: null, rawTarget: q.target, criterion: indicator.criterion,
      monthValues: Object.fromEntries(reports.months.map((month) => [month, indicator.periods[month].actual])), monthly, quarter,
    }
  })
  return {
    id: `${reports.version}-${entity.id}`, sourceKey: "PYC-AGR-ANT", company: reports.company, report: reports.report,
    profile: entity.profile, configuredProfile: entity.profile, year: reports.year, quarter: reports.quarter, months: reports.months,
    sourceFile: `Exportados Power BI y C4C cargados en el navegador (${reports.version})`, workspaceId: "", reportId: "",
    person: entity.name, cargo: entity.cargo, territory: entity.territoryLabel || null, companyExcel: null,
    originalQuarterResult: null, calculatedQuarterResult: entity.results[reports.quarter].result, validationDifference: null,
    validationStatus: entity.reportState === "final" ? "Final" : "Borrador", warning: entity.draftReasons.join(". "), indicators,
  }
}

export function toPdfPage(entity: Q3Entity, reports: AgricolaReports, period: string, loadedAt: string): IndividualPdfPage {
  const source = toIndividualSource(entity, reports, loadedAt)
  const isQuarter = period === reports.quarter
  const rows = source.indicators.map((indicator) => ({
    indicator,
    metric: isQuarter ? indicator.quarter : indicator.monthly.find((item) => item.month === period) ?? null,
  }))
  const pendingTitles = reports.pendingRules.filter((rule) => entity.pendingRules.includes(rule.id)).map((rule) => `Pendiente de validación - ${rule.title}`)
  const observations = [
    ...entity.observations,
    ...entity.indicators.flatMap((indicator) => {
      const value = indicator.periods[period]
      const notes = [...indicator.notes, ...value.notes]
      return notes.length ? [`${indicator.label}: ${[...new Set(notes)].map((note) => note.replace(/[.\s]+$/, "")).join(". ")}.`] : []
    }),
    ...entity.indicators.filter((indicator) => indicator.weight > 0).map((indicator) => `${indicator.label} - origen: ${indicator.attribution}; alcance: ${indicator.scope}. Fórmula: ${indicator.formula}.`),
    ...pendingTitles,
  ].map(pdfText)
  const summary = entity.results[period]
  const draftReasons = [...entity.draftReasons]
  if (!summary.complete && summary.applicable && period !== reports.quarter) draftReasons.push(`${partialReason(summary)} en el periodo`)
  if (summary.result !== null) observations.unshift(pdfText(`Resultado: ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(summary.result * 100)} puntos de 100 (aporte ponderado, sin redistribuir pesos). Cumplimiento normalizado: ${normalizedLabel(entity, period)}.${summary.complete ? "" : ` ${PARTIAL_LEVEL} (${partialDetail(summary)}).`}`))
  return {
    source, view: isQuarter ? "trimestral" : "mensual", month: isQuarter ? reports.months[0] : period,
    globalResult: summary.result, rows, generatedAt: loadedAt,
    extras: {
      reportTitle: KIND_TITLES[entity.kind],
      resultLabel: resultLabel(entity, period),
      levelLabel: summary.complete ? undefined : summary.applicable ? PARTIAL_LEVEL : NOT_APPLICABLE_LEVEL,
      draftReasons: (entity.reportState === "final" && summary.complete ? [] : draftReasons).map(pdfText),
      statusByIndicator: Object.fromEntries(entity.indicators.map((indicator) => [indicator.id, STATUS_LABELS[indicator.periods[period].status]])),
      observations,
    },
  }
}

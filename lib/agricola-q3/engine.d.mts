import type { PreparedBlock } from "../agricola-import.mjs"

export type PeriodStatus = "ok" | "parcial" | "sin_dato" | "sin_meta" | "no_aplica"
export type TargetPeriodicity = "anual" | "mensual" | "trimestral"
export type EntityKind = "individual" | "territorio" | "direccion"
export type EntityProfile = "Director" | "Comercial" | "Promotor" | "Territorio"
export type PositionStatus = "activo" | "vacante" | "sin_titular"

export interface PeriodResult {
  actual: number | null
  target: number | null
  rawCompliance: number | null
  recognizedCompliance: number | null
  contribution: number | null
  status: PeriodStatus
  notes: string[]
}

export interface Q3Indicator {
  id: string
  label: string
  weight: number
  cap: number | null
  calculationType: string
  criterion: string
  pending: string[]
  formula: string
  source: string
  attribution: string
  scope: string
  notes: string[]
  periods: Record<string, PeriodResult>
}

export interface EntityPeriodSummary {
  /** Weighted points over 100 (no redistribution). */
  result: number | null
  /** result / evaluatedWeight. */
  normalized: number | null
  evaluatedWeight: number
  totalWeight: number
  complete: boolean
  /** False when every weighted indicator is No aplica (territory without an active holder). */
  applicable: boolean
  missing: string[]
  withoutData: string[]
  withoutTarget: string[]
  notApplicable: string[]
}

export interface Q3Entity {
  id: string
  kind: EntityKind
  profile: EntityProfile
  name: string
  cargo: string
  territories: string[]
  territoryLabel: string
  status: PositionStatus
  indicators: Q3Indicator[]
  results: Record<string, EntityPeriodSummary>
  pendingRules: string[]
  observations: string[]
  reportState: "borrador" | "final"
  draftReasons: string[]
}

export interface PendingRule { id: string; title: string; detail: string }
export interface CatalogTerritory { name: string; label: string; operating: boolean }
export interface CatalogPerson {
  name: string
  key: string
  profile: "Director" | "Comercial" | "Promotor"
  cargo: string
  territories: string[]
  otherTerritories: string[]
  status: PositionStatus
}

export interface AgricolaConfig {
  version: string
  sourceKey: string
  company: string
  report: string
  year: number
  quarter: string
  months: string[]
  rulesValidated: boolean
  catalog: {
    source: string
    territoryPrefix: string
    nonOperatingTerritories: string[]
    territoryLabels: Record<string, string>
    territoryGroups?: { label: string; members: string[] }[]
    vacancyPattern: string
    unassignedRule: string
  }
  targets: {
    director: { visitsPerMonth: number | null; coveragePerMonth: number | null; coverageMissing: string }
    fieldTargets: {
      perActivePromoter: { activitiesPerQuarter: number; plotsPerQuarter: number; hectaresPerQuarter: number; cropsPerQuarter: number }
      vacanciesGenerateTarget: boolean
      commercialScope: "territorio_asignado" | "personal"
    }
    newClients: Record<"commercial" | "promoters", { field: string; periodicity: TargetPeriodicity; quarterTarget?: number }>
  }
  policies: {
    blankValues: string
    farmsWithoutRecords: "cero" | "sin_dato"
  }
  indicators: { id: string; label: string; weight: number; cap: number | null; calculationType: string; pending: string[]; criterion: string }[]
  approvedRules: PendingRule[]
  pendingRules: PendingRule[]
}

export interface AgricolaReports {
  version: string
  report: string
  company: string
  year: number
  quarter: string
  months: string[]
  periods: string[]
  entities: Q3Entity[]
  territories: CatalogTerritory[]
  unknownPeople: { name: string; sources: string[]; count: number }[]
  observations: string[]
  pendingRules: PendingRule[]
  approvedRules: PendingRule[]
  rulesValidated: boolean
}

export interface ReconcileControl { read?: number; selected?: number; months?: Record<string, number>; byType?: Record<string, number> }
export interface ReconcileCheck { block: string; check: string; expected: number | string; actual: number | string; ok: boolean }

export function sumField(rows: Record<string, unknown>[], field: string): { value: number | null; present: number; blanks: number }
export function evaluateRatio(input: { actual: number | null; target: number | null; cap: number | null; weight: number }): Pick<PeriodResult, "rawCompliance" | "recognizedCompliance" | "contribution" | "status">
export function deriveCatalog(blocks: Partial<Record<string, PreparedBlock>>, config: AgricolaConfig): { people: CatalogPerson[]; territories: CatalogTerritory[]; groups: { label: string; members: string[] }[]; observations: string[] }
export function buildAgricolaReports(input: { blocks: Partial<Record<string, PreparedBlock>>; config: AgricolaConfig }): AgricolaReports
export function reconcile(blocks: Partial<Record<string, PreparedBlock>>, controls: Record<string, ReconcileControl>): ReconcileCheck[]

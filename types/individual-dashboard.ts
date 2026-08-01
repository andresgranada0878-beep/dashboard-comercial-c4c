export type DashboardView = "trimestral" | "mensual"

export interface MonthlyIndicatorValue {
  month: string
  actual: number | null
  target: number | null
  rawCompliance: number | null
  recognizedCompliance: number | null
  contribution: number | null
}

export interface QuarterIndicatorValue {
  actual: number | null
  target: number | null
  rawCompliance: number | null
  recognizedCompliance: number | null
  contribution: number | null
}

export interface IndividualIndicator {
  id: string
  label: string
  row: number
  calculationType: string
  formula: string
  weight: number
  cap: number | null
  targetThreshold: number | null
  rawTarget: number | null
  criterion: string
  monthValues: Record<string, number | null>
  monthly: MonthlyIndicatorValue[]
  quarter: QuarterIndicatorValue
}

export interface IndividualSource {
  id: string
  sourceKey: string
  company: string
  report: string
  profile: string
  configuredProfile: string
  year: number
  quarter: string
  months: string[]
  sourceFile: string
  workspaceId: string
  reportId: string
  person: string
  cargo: string | null
  territory: string | null
  companyExcel: string | null
  originalQuarterResult: number | null
  calculatedQuarterResult: number | null
  validationDifference: number | null
  validationStatus: string
  warning: string
  indicators: IndividualIndicator[]
}

export interface IndividualDashboardPayload {
  generatedAt: string
  scope: string
  source: string
  reports: Array<{
    key: string
    workspace_id: string
    report_id: string
    company: string
    unit: string
  }>
  sources: IndividualSource[]
  errors: string[]
}

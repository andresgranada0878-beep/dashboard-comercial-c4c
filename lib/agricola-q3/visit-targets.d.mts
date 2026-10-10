export interface ImportedVisitsTarget { Promotor: string; "Meta visitas Q3": number }
export interface PreparedVisitTargets { records: ImportedVisitsTarget[]; issues: string[]; summary: { read: number; selected: number } }
export function prepareVisitTargetsRows(matrix: unknown[][]): PreparedVisitTargets

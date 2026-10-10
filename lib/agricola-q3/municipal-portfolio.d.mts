export interface ClientRow { id: string; city: string; department: string; key: string | null; visitable: boolean }
export interface MunicipalRow { key: string; city: string; department: string; promoter: string; territory: string; assigned: boolean }
export interface AccountsSource { accounts: ClientRow[]; issues: string[] }
export interface MunicipalSource { municipalities: MunicipalRow[]; issues: string[] }
export interface PromoterPortfolio { promoter: string; territory: string; accounts: number; visitable: number; municipalities: number }
export interface PendingMunicipality { municipality: string; department: string; accounts: number; visitable: number; reason: string }
export interface PortfolioSummary {
  accounts: number; visitable: number; assigned: number; assignedVisitable: number; pending: number;
  pendingVisitable: number; withoutCity: number; withoutCityVisitable: number; mappedMunicipalities: number;
  totalMunicipalities: number; complete: boolean;
}
export interface PortfolioReport { summary: PortfolioSummary; issues: string[]; promoters: PromoterPortfolio[]; pendingMunicipalities: PendingMunicipality[] }
export function keyOfMunicipality(city: unknown, department: unknown): string | null
export function parseAccountExport(matrix: unknown[][]): AccountsSource
export function parseOfficialMunicipalities(matrix: unknown[][]): MunicipalSource
export function buildMunicipalPortfolio(accountsSource: AccountsSource, mappingsSource: MunicipalSource): PortfolioReport

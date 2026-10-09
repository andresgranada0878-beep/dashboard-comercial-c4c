export interface ImportBlock { id: string; label: string; required: string[] }
export interface PreparedBlock {
 headers: string[]; rows: string[][]; errors: string[];
 records: Record<string, unknown>[]; issues: string[]; warnings: string[]; excluded: number;
}
export const AGRICOLA_BLOCKS: ImportBlock[];
export function rawNumber(value: unknown): number | null;
export function prepareAgricolaBlock(id: string, text: string, year: number, quarter: string): PreparedBlock;
export function technicalReferenceCount(record: Record<string, number | null>): number | null;

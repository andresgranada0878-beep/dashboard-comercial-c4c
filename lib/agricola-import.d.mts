export interface ImportBlock { id: string; label: string; required: string[] }
export interface BlockSummary {
 origin: "paste" | "file"; read: number; selected: number;
 excludedByReason: Record<string, number>; months: Record<string, number>;
 blanks: Record<string, number>; byType?: Record<string, number>;
}
export interface PreparedBlock {
 headers: string[]; rows: unknown[][]; errors: string[];
 records: Record<string, unknown>[]; issues: string[]; warnings: string[]; excluded: number;
 summary: BlockSummary;
}
export const AGRICOLA_BLOCKS: ImportBlock[];
export const AUXILIARY_TARGETS_BLOCK: ImportBlock;
export function detectDecimalSeparator(values: unknown[]): { decimal: "," | "."; ambiguous: boolean };
export function parseNumber(value: unknown, decimal?: "," | "."): number | null;
export function rawNumber(value: unknown): number | null;
export function referenceCount(ratio: number | null, target: number | null, halfStep?: number): { value: number | null; exact: boolean };
export function prepareAgricolaBlock(id: string, text: string, year: number, quarter: string): PreparedBlock;
export function prepareAgricolaRows(id: string, matrix: unknown[][], year: number, quarter: string, options?: { origin?: "paste" | "file"; errors?: string[] }): PreparedBlock;
export function technicalReferenceCount(record: Record<string, number | null>): number | null;

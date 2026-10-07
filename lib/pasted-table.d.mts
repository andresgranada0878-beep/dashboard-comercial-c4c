export interface PastedTable { headers: string[]; rows: string[][]; errors: string[] }
export function normalizeHeader(value: unknown): string;
export function parsePastedTable(text: string): PastedTable;
export const QUARTER_MONTHS: Record<string, string[]>;
export function validatePeriod(table: PastedTable, mapping: { month: number; year?: number }, year: number, quarter: string): string[];

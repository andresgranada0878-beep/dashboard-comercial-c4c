export function normalizeHeader(value: unknown): string;
export function parseDelimitedRows(text: string): { rows: string[][]; errors: string[] };
export function parsePastedTable(text: string): { headers: string[]; rows: unknown[][]; errors: string[] };
export function findHeaderRow(rows: unknown[][], requiredHeaders: string[], maxScan?: number): number;
export function tableFromRows(rows: unknown[][], headerIndex: number, initialErrors?: string[]): { headers: string[]; rows: unknown[][]; errors: string[] };
export const QUARTER_MONTHS: Record<"Q1" | "Q2" | "Q3" | "Q4", string[]>;
export function validatePeriod(table: { headers: string[]; rows: unknown[][]; errors: string[] }, mapping: { month?: number; year?: number }, year: number, quarter: string): string[];

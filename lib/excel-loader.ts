import fs from "node:fs"
import path from "node:path"
import * as XLSX from "xlsx"

import {
  EXPECTED_SHEETS,
  OPTIONAL_SHEETS,
  REQUIRED_COLUMNS,
  SHEET_ALIASES,
} from "@/config/excel-schema"
import { canonical, normalizeHeader, normalizeText } from "@/lib/data-validation"
import {
  type ExcelWorkbookSummary,
  type RawExcelCell,
  type RawExcelSheet,
  type RawExcelWorkbook,
  type WorkbookWarning,
} from "@/types/dashboard"

export function resolveExcelFilePath(candidatePath?: string): string {
  const candidates = candidatePath
    ? [candidatePath]
    : [
        "data/informe-c4c.xlsx",
        "public/data/informe-c4c.xlsx",
        "./data/informe-c4c.xlsx",
        "./public/data/informe-c4c.xlsx",
      ]

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate)
    if (fs.existsSync(absolute)) return absolute
  }

  return path.resolve(process.cwd(), "public/data/informe-c4c.xlsx")
}

function isEmptyCell(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ""
}

function normalizeOriginalRow(row: unknown[]): Record<string, unknown> {
  return row.reduce<Record<string, unknown>>((acc, value, index) => {
    acc[`column_${index + 1}`] = value
    return acc
  }, {})
}

function buildWorkbookSummary(sheets: RawExcelSheet[]): ExcelWorkbookSummary {
  const warnings: string[] = []
  const errors: string[] = []
  const sheetsFound = sheets.map((sheet) => sheet.name)
  const sheetsMissing = EXPECTED_SHEETS.filter((expected) => !sheetsFound.includes(expected))

  for (const sheet of sheets) {
    const missingColumns = REQUIRED_COLUMNS[sheet.name] ?? []
    const normalizedColumns = sheet.headers.map((header) => canonical(header))
    const missing = missingColumns.filter(
      (required) => !normalizedColumns.some((header) => header === canonical(required)),
    )

    if (missing.length > 0) {
      warnings.push(`${sheet.name}: columnas faltantes: ${missing.join(", ")}`)
    }

    if (sheet.duplicateHeaders.length > 0) {
      warnings.push(`${sheet.name}: encabezados duplicados: ${sheet.duplicateHeaders.join(", ")}`)
    }
  }

  if (sheetsMissing.length > 0) {
    errors.push(`Hojas faltantes: ${sheetsMissing.join(", ")}`)
  }

  return {
    fileName: "informe-c4c.xlsx",
    loadedAt: new Date().toISOString(),
    sheetsFound,
    sheetsMissing,
    recordsProcessed: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
    recordsDiscarded: 0,
    errors,
    warnings,
    updatedAt: new Date().toISOString(),
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
  }
}

function buildSheetData(sheetName: string, rawRows: unknown[][]): RawExcelSheet {
  const nonEmptyRows = rawRows.filter((row) => row.some((value) => !isEmptyCell(value)))
  const headerRow = nonEmptyRows[0] ?? []
  const originalHeaders = headerRow.map((headerValue, index) => normalizeText(headerValue) ?? `column_${index + 1}`)
  const normalizedHeaders = originalHeaders.map((header) => normalizeHeader(header))
  const seen = new Map<string, number>()
  const duplicateHeaders: string[] = []

  for (const header of normalizedHeaders) {
    if (header && seen.has(header)) duplicateHeaders.push(header)
    else if (header) seen.set(header, 1)
  }

  const rows = [] as RawExcelSheet["rows"]

  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
    const rawRow = rawRows[rowIndex] ?? []
    if (!rawRow.some((value) => !isEmptyCell(value))) continue

    const original = normalizeOriginalRow(rawRow)
    const normalized: Record<string, unknown> = {}

    for (let columnIndex = 0; columnIndex < originalHeaders.length; columnIndex += 1) {
      const rawValue = rawRow[columnIndex] ?? null
      const normalizedKey = normalizedHeaders[columnIndex] ?? `column_${columnIndex + 1}`
      const cell: RawExcelCell = {
        raw: rawValue,
        normalized: rawValue,
        isError: typeof rawValue === "string" && rawValue.trim().toUpperCase().startsWith("#"),
      }

      normalized[normalizedKey] = cell.normalized
      normalized[`${normalizedKey}_raw`] = cell.raw
    }

    rows.push({
      rowNumber: rowIndex + 1,
      sheet: sheetName,
      original,
      normalized,
    })
  }

  return {
    name: sheetName,
    headers: originalHeaders,
    normalizedHeaders,
    duplicateHeaders: [...new Set(duplicateHeaders)],
    rows,
  }
}

export async function readExcelWorkbook(filePath?: string): Promise<RawExcelWorkbook> {
  const resolvedPath = resolveExcelFilePath(filePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`No se encontró el archivo Excel en la ruta: ${resolvedPath}`)
  }

  const workbook = XLSX.readFile(resolvedPath)
  const sheets: RawExcelSheet[] = []

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as unknown[][]

    sheets.push(buildSheetData(sheetName, rows))
  }

  const summary = buildWorkbookSummary(sheets)
  const normalizedSheetNames = sheets.map((sheet) => sheet.name)
  const missingSheets = EXPECTED_SHEETS.filter((expected) => !normalizedSheetNames.includes(expected))

  if (missingSheets.length > 0) {
    summary.errors.push(`Hojas no encontradas: ${missingSheets.join(", ")}`)
    summary.status = "error"
  }

  for (const alias of OPTIONAL_SHEETS) {
    if (!normalizedSheetNames.includes(alias)) {
      summary.warnings.push(`Hoja opcional no encontrada: ${alias}`)
    }
  }

  for (const alias of SHEET_ALIASES) {
    if (!normalizedSheetNames.includes(alias)) {
      summary.warnings.push(`Alias de hoja no encontrado: ${alias}`)
    }
  }

  return {
    fileName: path.basename(resolvedPath),
    filePath: resolvedPath,
    workbookName: path.basename(resolvedPath),
    sheets,
    summary,
  }
}

export async function readDefaultExcelWorkbook(): Promise<RawExcelWorkbook> {
  return readExcelWorkbook(resolveExcelFilePath())
}

export function toWorkbookWarnings(rawWorkbook: RawExcelWorkbook): WorkbookWarning[] {
  const warnings: WorkbookWarning[] = []
  for (const sheet of rawWorkbook.sheets) {
    if (sheet.duplicateHeaders.length > 0) {
      warnings.push({
        sheet: sheet.name,
        code: "duplicate_headers",
        message: `Encabezados duplicados: ${sheet.duplicateHeaders.join(", ")}`,
      })
    }
    for (const row of sheet.rows) {
      for (const [key, value] of Object.entries(row.normalized)) {
        if (typeof value === "string" && /#(?:VALUE|DIV\/0|NAME|N\/A|REF|NULL|NUM)!?/i.test(value)) {
          warnings.push({
            sheet: sheet.name,
            code: "excel_error",
            message: `Error de Excel detectado en ${key}: ${value}`,
          })
        }
      }
    }
  }
  return warnings
}

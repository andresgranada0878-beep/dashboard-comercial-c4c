import {
  type CompanyRecord,
  type ExcelNormalizedData,
  type RawExcelWorkbook,
  type WorkbookWarning,
} from "@/types/dashboard"
import { canonical, cleanText, normalizeMonth, normalizeText, toId } from "@/lib/data-validation"

export function normalizeRecordValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return null
    if (trimmed === "(en blanco)" || trimmed.toLowerCase() === "(en blanco)") return null
    return cleanText(trimmed) ?? null
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  return value
}

export function detectWarnings(rawWorkbook: RawExcelWorkbook): WorkbookWarning[] {
  const warnings: WorkbookWarning[] = []

  for (const sheet of rawWorkbook.sheets) {
    if (sheet.duplicateHeaders.length > 0) {
      warnings.push({
        sheet: sheet.name,
        code: "duplicate_headers",
        message: `Encabezados duplicados: ${sheet.duplicateHeaders.join(", ")}`,
      })
    }

    const emptyRows = sheet.rows.filter((row) => row.rowNumber > 1 && Object.keys(row.normalized).length === 0)
    if (emptyRows.length > 0) {
      warnings.push({
        sheet: sheet.name,
        code: "empty_rows",
        message: `Filas vacías detectadas: ${emptyRows.length}`,
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

export function extractCompanyRecords(rawWorkbook: RawExcelWorkbook): CompanyRecord[] {
  const records: CompanyRecord[] = []
  const sheet = rawWorkbook.sheets.find((item) => canonical(item.name) === canonical("Tabla dinam gestion comercial"))
  if (!sheet) return records

  for (const row of sheet.rows) {
    const empresa = normalizeRecordValue(row.normalized.empresa ?? row.normalized.empresa_raw ?? null)
    const territorio = normalizeRecordValue(row.normalized.territorio ?? row.normalized.territorio_raw ?? null)
    const comercial = normalizeRecordValue(row.normalized.comercial ?? row.normalized.comercial_raw ?? null)
    const cargo = normalizeRecordValue(row.normalized.cargo ?? row.normalized.cargo_raw ?? null)
    const empleado = normalizeRecordValue(row.normalized.empleado ?? row.normalized.empleado_raw ?? null)
    const mes = normalizeRecordValue(row.normalized.mes ?? row.normalized.mes_raw ?? null)

    if (!empresa && !territorio && !comercial && !cargo && !empleado && !mes) continue

    records.push({
      id: toId(`${empresa ?? "empresa"}-${territorio ?? "territorio"}-${comercial ?? empleado ?? "comercial"}`),
      empresa: empresa ? String(empresa) : null,
      territorio: territorio ? String(territorio) : null,
      comercial: comercial ? String(comercial) : null,
      cargo: cargo ? String(cargo) : null,
      empleado: empleado ? String(empleado) : null,
      mes: normalizeMonth(mes) ?? null,
      trimestre: null,
    })
  }

  return records
}

export function normalizeWorkbook(rawWorkbook: RawExcelWorkbook): ExcelNormalizedData {
  const warnings = detectWarnings(rawWorkbook)

  const companies = extractCompanyRecords(rawWorkbook)

  const months = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows.flatMap((row) =>
          Object.values(row.normalized)
            .map((value) => (typeof value === "string" ? normalizeMonth(value) : null))
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ),
  )

  const territories = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows
          .map((row) => {
            const value = row.normalized.territorio ?? row.normalized.territorio_de_ventas ?? null
            return typeof value === "string" ? cleanText(value) : null
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  )

  const units = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows
          .map((row) => {
            const value = row.normalized.unidad_de_negocio ?? row.normalized.unidad ?? null
            return typeof value === "string" ? cleanText(value) : null
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  )

  const advisors = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows
          .map((row) => {
            const value = row.normalized.comercial ?? row.normalized.empleado ?? row.normalized.nombre ?? null
            return typeof value === "string" ? cleanText(value) : null
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  )

  const cargos = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows
          .map((row) => {
            const value = row.normalized.cargo ?? row.normalized.cargo_comercial ?? null
            return typeof value === "string" ? cleanText(value) : null
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  )

  const indicators = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows.flatMap((row) =>
          Object.values(row.normalized)
            .map((value) => {
              if (typeof value !== "string") return null
              const normalized = canonical(value)
              if (
                normalized.includes("ejecucion") ||
                normalized.includes("cobertura") ||
                normalized.includes("nuevos") ||
                normalized.includes("recomend") ||
                normalized.includes("referencia") ||
                normalized.includes("lead") ||
                normalized.includes("impacto") ||
                normalized.includes("hectareas") ||
                normalized.includes("cultivos")
              ) {
                return cleanText(value)
              }
              return null
            })
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ),
  )

  const metas = rawWorkbook.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) =>
      Object.entries(row.normalized)
        .filter(([key, value]) => /meta|peso|cumplimiento/i.test(key))
        .map(([key, value]) => ({ key, value: normalizeRecordValue(value) })),
    ),
  )

  const results = rawWorkbook.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) =>
      Object.entries(row.normalized)
        .filter(([key, value]) => /cumpl|resultado|gestion|valor/i.test(key))
        .map(([key, value]) => ({ key, value: normalizeRecordValue(value) })),
    ),
  )

  const weights = rawWorkbook.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) =>
      Object.entries(row.normalized)
        .filter(([key]) => /peso/i.test(key))
        .map(([key, value]) => ({ key, value: normalizeRecordValue(value) })),
    ),
  )

  const quarters = Array.from(
    new Set(
      rawWorkbook.sheets.flatMap((sheet) =>
        sheet.rows
          .map((row) => normalizeRecordValue(row.normalized.trimestre ?? row.normalized.quarter ?? null))
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  )

  return {
    companies,
    units,
    territories,
    advisors,
    cargos,
    months,
    quarters,
    indicators,
    metas,
    results,
    weights,
    warnings,
    summary: rawWorkbook.summary,
    meta: {
      fileName: rawWorkbook.fileName,
      loadedAt: rawWorkbook.summary.loadedAt,
      source: "default",
    },
  }
}

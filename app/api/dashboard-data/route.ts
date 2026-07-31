import fs from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

import { INDICATOR_DEFINITIONS } from "@/config/indicators"
import { readExcelWorkbook } from "@/lib/excel-loader"
import { calculateIndicatorResults, summarizeIndicatorMetrics, buildGlobalResult } from "@/lib/indicator-calculator"
import { extractIndicatorRecords, type IndicatorSourceRecord } from "@/lib/indicator-extractor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DATA_DIRECTORY = path.resolve(process.cwd(), "data")

function listExcelFiles(): string[] {
  if (!fs.existsSync(DATA_DIRECTORY)) return []

  const files = fs
    .readdirSync(DATA_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(xlsx|xls)$/i.test(entry.name))
    .map((entry) => path.join(DATA_DIRECTORY, entry.name))
    .sort((left, right) => left.localeCompare(right))

  return files
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function getDefaultQuarter(options: string[]): string {
  if (options.length === 0) return "Todos"
  const lastQuarter = [...options].sort((left, right) => {
    const numberLeft = Number(left.replace(/\D+/g, "")) || 0
    const numberRight = Number(right.replace(/\D+/g, "")) || 0
    return numberLeft - numberRight
  }).at(-1)

  return lastQuarter ?? "Todos"
}

export async function GET() {
  try {
    const dataDirectory = DATA_DIRECTORY
    console.log("[dashboard-data] cwd", process.cwd())
    console.log("[dashboard-data] dataDirectory", dataDirectory)

    const entries = await fs.promises.readdir(dataDirectory, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && /\.(xlsx|xls)$/i.test(entry.name))
      .map((entry) => path.join(dataDirectory, entry.name))
      .sort((left, right) => left.localeCompare(right))

    console.log("[dashboard-data] detected files", files)

    if (files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          status: "archivo-no-encontrado",
          message: "No se encontraron archivos Excel válidos dentro de la carpeta data.",
          filesProcessed: [],
          recordsProcessed: 0,
          sheetsProcessed: [],
          warnings: [],
          errors: ["No se encontró ningún archivo .xlsx dentro de data."],
          availableFilters: {
            empresas: [],
            unidades: [],
            territorios: [],
            asesores: [],
            cargos: [],
            anios: [],
            trimestres: [],
            meses: [],
          },
          defaultFilters: {
            empresa: "Todos",
            unidad: "Todos",
            territorio: "Todos",
            asesor: "Todos",
            cargo: "Todos",
            anio: "Todos",
            trimestre: "Todos",
            mes: "Todos",
          },
          indicators: INDICATOR_DEFINITIONS.map((indicator) => ({ key: indicator.key, label: indicator.label })),
        },
        {
          status: 404,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        },
      )
    }

    const processedRecords: IndicatorSourceRecord[] = []
    const processedFiles: string[] = []
    const processedSheets: string[] = []
    const warnings: string[] = []
    const errors: string[] = []

    for (const filePath of files) {
      try {
        const workbook = await readExcelWorkbook(filePath)
        const records = extractIndicatorRecords(workbook)
        processedFiles.push(workbook.fileName)
        processedSheets.push(...workbook.sheets.map((sheet) => sheet.name))
        processedRecords.push(...records)
        warnings.push(...workbook.summary.warnings)
        errors.push(...workbook.summary.errors)
        console.log("[dashboard-data] processed file", workbook.fileName, "records", records.length, "sheets", workbook.sheets.length)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido al procesar el archivo Excel."
        errors.push(`${path.basename(filePath)}: ${message}`)
        console.error("[dashboard-data] file error", filePath, message)
      }
    }

    console.log("[dashboard-data] processed files", processedFiles)
    console.log("[dashboard-data] file errors", errors)

    const availableFilters = {
      empresas: unique(processedRecords.map((record) => record.empresa)),
      unidades: unique(processedRecords.map((record) => record.unidadNegocio)),
      territorios: unique(processedRecords.map((record) => record.territorio)),
      asesores: unique(processedRecords.map((record) => record.asesor)),
      cargos: unique(processedRecords.map((record) => record.cargo)),
      anios: [...new Set(processedRecords.map((record) => record.anio).filter((value): value is number => value !== null))].sort((left, right) => left - right),
      trimestres: unique(processedRecords.map((record) => record.trimestre)).sort((left, right) => {
        const valueLeft = Number((left || "").replace(/\D+/g, "")) || 0
        const valueRight = Number((right || "").replace(/\D+/g, "")) || 0
        return valueLeft - valueRight
      }),
      meses: unique(processedRecords.map((record) => record.mes)),
    }

    const summary = summarizeIndicatorMetrics(processedRecords)
    const resultItems = calculateIndicatorResults(processedRecords)
    const globalResult = buildGlobalResult(processedRecords)
    const latestQuarter = getDefaultQuarter(availableFilters.trimestres)

    return NextResponse.json(
      {
        ok: true,
        status: processedRecords.length > 0 ? (errors.length > 0 ? "informacion-parcial" : "datos-cargados") : "sin-informacion",
        message: processedRecords.length > 0 ? "Datos cargados correctamente desde Excel." : "No se encontraron registros válidos tras normalizar el Excel.",
        updatedAt: new Date().toISOString(),
        filesProcessed: processedFiles,
        recordsProcessed: processedRecords.length,
        sheetsProcessed: [...new Set(processedSheets)],
        warnings: [...new Set(warnings.filter(Boolean))],
        errors: [...new Set(errors.filter(Boolean))],
        availableFilters,
        defaultFilters: {
          empresa: "Todos",
          unidad: "Todos",
          territorio: "Todos",
          asesor: "Todos",
          cargo: "Todos",
          anio: "Todos",
          trimestre: latestQuarter,
          mes: "Todos",
        },
        indicators: INDICATOR_DEFINITIONS.map((indicator) => ({
          key: indicator.key,
          label: indicator.label,
          shortLabel: indicator.shortLabel,
          defaultWeight: indicator.defaultWeight,
        })),
        indicadoresSinInformacion: summary.indicadoresSinInformacion,
        summary,
        globalResult,
        results: resultItems,
        records: processedRecords,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error no identificado al cargar el dashboard."

    return NextResponse.json(
      {
        ok: false,
        status: "error-procesamiento",
        message,
        filesProcessed: [],
        recordsProcessed: 0,
        sheetsProcessed: [],
        warnings: [],
        errors: [message],
        availableFilters: {
          empresas: [],
          unidades: [],
          territorios: [],
          asesores: [],
          cargos: [],
          anios: [],
          trimestres: [],
          meses: [],
        },
        indicators: INDICATOR_DEFINITIONS.map((indicator) => ({ key: indicator.key, label: indicator.label })),
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      },
    )
  }
}

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import * as XLSX from "xlsx"

XLSX.set_fs(fs)

const root = process.cwd()
const configPath = path.join(root, "data", "configuracion-c4c.json")
const sourcesDir = path.join(root, "data", "fuentes")
const outputDir = path.join(root, "data", "generated")
const outputPath = path.join(outputDir, "individual-c4c.json")

const config = JSON.parse(fs.readFileSync(configPath, "utf8"))

const normalized = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const fileAliases = new Map([
  ["informe Q1 - Final(1).xlsx", "informe Q1 - Final.xlsx"],
  ["informe Q1 - Galagro Ant Final(1).xlsx", "informe Q1 - Galagro Ant Final.xlsx"],
  ["informe Q1 - Galagro Nacional - Promotor(1).xlsx", "informe Q1 - Galagro Nacional - Promotor.xlsx"],
])

const sourceRows = config.source_rows.map((row) => ({
  sourceKey: row[0],
  company: row[1],
  report: row[2],
  configuredProfile: row[3],
  year: Number(row[4]),
  quarter: row[5],
  months: String(row[6]).split(",").map((month) => month.trim()),
  sourceFile: fileAliases.get(row[7]) ?? row[7],
  workspaceId: row[8],
  reportId: row[9],
  sheetName: "mensual",
}))

sourceRows.push(
  ...sourceRows
    .filter((source) =>
      ["PYC-AGR-ANT", "GAL-ANT"].includes(source.sourceKey),
    )
    .map((source) => ({
      ...source,
      configuredProfile: "Director",
      sheetName: "Director",
    })),
)

const resultRows = config.result_rows
  .filter(
    (row) =>
      (row[6] === "Individual" && row[7] === "mensual") ||
      (row[6] === "Director / consolidado" && row[7] === "Director"),
  )
  .map((row) => ({
    sourceKey: row[0],
    year: Number(row[4]),
    quarter: row[5],
    sheetName: row[7],
    name: row[8],
    cargo: row[9],
    territory: row[10],
    companyExcel: row[11],
    resultCell: row[12],
    result: typeof row[13] === "number" ? row[13] : null,
    resultPercent: typeof row[14] === "number" ? row[14] : null,
    validationStatus: row[15],
    warning: row[16] || "",
    sourceFile: fileAliases.get(row[17]) ?? row[17],
  }))

const ruleRows = config.rules_rows.map((row) => ({
  sourceKey: row[0],
  company: row[1],
  report: row[2],
  configuredProfile: row[3],
  year: Number(row[4]),
  quarter: row[5],
  monthsLabel: row[6],
  level: row[7],
  sheet: row[8],
  rowNumber: Number(row[9]),
  indicatorId: row[10],
  indicatorName: row[11],
  baseWeight: typeof row[12] === "number" ? row[12] : null,
  configuredCap: typeof row[13] === "number" ? row[13] : null,
  calculationType: row[14],
  quarterFormula: row[15],
  monthFormulas: [row[16], row[17], row[18]],
  targetFormula: row[19],
  cachedCompliance: typeof row[20] === "number" ? row[20] : null,
  targetThreshold: typeof row[21] === "number" ? row[21] : null,
}))

function readCell(sheet, address) {
  const cell = sheet[address]
  if (!cell) return null
  return cell.v ?? null
}

function findMetadata(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:O40")
  const values = new Map()
  for (let row = range.s.r; row <= Math.min(range.e.r, 12); row += 1) {
    for (let col = range.s.c; col <= Math.min(range.e.c, 14); col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col })
      const value = readCell(sheet, address)
      if (value !== null && value !== undefined) values.set(address, value)
    }
  }

  const findNextValue = (label) => {
    const target = normalized(label)
    for (const [address, value] of values) {
      if (normalized(value).replace(/:$/, "") !== target.replace(/:$/, "")) continue
      const decoded = XLSX.utils.decode_cell(address)
      for (let offset = 1; offset <= 4; offset += 1) {
        const candidate = readCell(sheet, XLSX.utils.encode_cell({ r: decoded.r, c: decoded.c + offset }))
        if (candidate !== null && candidate !== undefined && String(candidate).trim()) return String(candidate).trim()
      }
    }
    return null
  }

  const name = findNextValue("Nombre")
  const cargo = findNextValue("Cargo")
  const territory = findNextValue("Territorio")
  const company = findNextValue("Empresa")

  let resultCell = null
  let result = null
  for (const [address, value] of values) {
    if (!normalized(value).includes("resultado global")) continue
    const decoded = XLSX.utils.decode_cell(address)
    for (let offset = 1; offset <= 3; offset += 1) {
      const candidateAddress = XLSX.utils.encode_cell({ r: decoded.r + offset, c: decoded.c })
      const candidate = readCell(sheet, candidateAddress)
      if (typeof candidate === "number") {
        resultCell = candidateAddress
        result = candidate
        break
      }
    }
    if (result !== null) break
  }

  return { name, cargo, territory, company, resultCell, result }
}

function inferProfile(cargo, configuredProfile) {
  const text = normalized(cargo)
  if (text.includes("promotor")) return "Promotor"
  if (text.includes("director") || text.startsWith("dir ")) return "Director"
  if (text.includes("rtc") || text.includes("rc ") || text.includes("comercial")) return "Comercial"
  return configuredProfile === "General" ? "Comercial" : configuredProfile
}

function inferCap(formula, configuredCap) {
  const text = String(formula ?? "").replace(/\s+/g, "").toUpperCase()
  if (text.includes("MIN(150%") || text.includes(",150%)")) return 1.5
  if (text.includes("MIN(100%") || text.includes(",100%)")) return 1
  return configuredCap
}

function quarterActual(calculationType, monthValues) {
  const valid = monthValues.filter((value) => typeof value === "number" && Number.isFinite(value))
  if (!valid.length) return null
  if (calculationType === "promedio_mensual") return valid.reduce((sum, value) => sum + value, 0) / valid.length
  return valid.reduce((sum, value) => sum + value, 0)
}

function quarterTarget(calculationType, rawTarget, monthCount) {
  if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget)) return null
  if (calculationType === "ratio") return rawTarget * monthCount
  return rawTarget
}

function monthlyTarget(calculationType, rawTarget, monthCount) {
  if (typeof rawTarget !== "number" || !Number.isFinite(rawTarget)) return null
  if (calculationType === "ratio_acumulado") return rawTarget / monthCount
  return rawTarget
}

function clampCompliance(value, cap) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (typeof cap === "number") return Math.min(value, cap)
  return value
}

function cleanNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const sources = []
const errors = []

for (const source of sourceRows) {
  const filePath = path.join(sourcesDir, source.sourceFile)
  if (!fs.existsSync(filePath)) {
    errors.push(`No se encontró ${source.sourceFile}`)
    continue
  }

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true })
    const sheet = workbook.Sheets[source.sheetName ?? "mensual"]
    if (!sheet) {
      errors.push(
        `${source.sourceFile}: no tiene hoja ${source.sheetName ?? "mensual"}`,
      )
      continue
    }

    const meta = findMetadata(sheet)
    const resultReference = resultRows.find(
      (row) =>
        row.sourceKey === source.sourceKey &&
        row.year === source.year &&
        row.quarter === source.quarter &&
        row.sourceFile === source.sourceFile &&
        row.sheetName === source.sheetName,
    )
    const rulesProfile =
      source.configuredProfile === "Director"
        ? "General"
        : source.configuredProfile

    const baseRules = ruleRows.filter(
      (rule) =>
        rule.sourceKey === source.sourceKey &&
        rule.year === source.year &&
        rule.quarter === source.quarter &&
        rule.configuredProfile === rulesProfile,
    )

    const matchingRules =
      source.configuredProfile === "Director"
        ? Array.from({ length: 11 }, (_, index) => index + 14)
            .map((rowNumber) => {
              const label = String(
                readCell(sheet, `B${rowNumber}`) ?? "",
              )
                .replace(/\s+/g, " ")
                .trim()

              const normalizedLabel = normalized(label)

              const expectedIndicatorId = config.equiv_rows.find(
                ([originalName]) =>
                  normalized(originalName) === normalizedLabel,
              )?.[1]

              const rule =
                baseRules.find(
                  (item) =>
                    expectedIndicatorId &&
                    item.indicatorId === expectedIndicatorId,
                ) ??
                baseRules.find(
                  (item) =>
                    normalized(item.indicatorName) === normalizedLabel,
                )

              return rule ? { ...rule, rowNumber } : null
            })
            .filter(Boolean)
        : baseRules

    const indicators = matchingRules.map((rule) => {
      const row = rule.rowNumber
      const label = String(readCell(sheet, `B${row}`) ?? rule.indicatorName).replace(/\s+/g, " ").trim()
      const quarterCompliance = cleanNumber(readCell(sheet, `D${row}`)) ?? rule.cachedCompliance
      const threshold = cleanNumber(readCell(sheet, `E${row}`)) ?? rule.targetThreshold
      const weight = cleanNumber(readCell(sheet, `F${row}`)) ?? rule.baseWeight ?? 0
      const monthValues = source.months.map((_, index) => cleanNumber(readCell(sheet, `${["G", "H", "I"][index]}${row}`)))
      const rawTarget = cleanNumber(readCell(sheet, `J${row}`))
      const criterion = String(readCell(sheet, `K${row}`) ?? "").trim()
      const formula = sheet[`D${row}`]?.f ?? rule.quarterFormula
      const cap = inferCap(formula, rule.configuredCap)
      const qActual = quarterActual(rule.calculationType, monthValues)
      const qTarget = quarterTarget(rule.calculationType, rawTarget, source.months.length)
      const quarterContribution = quarterCompliance === null ? null : quarterCompliance * weight

      const monthly = source.months.map((month, index) => {
        const actual = monthValues[index]
        const target = monthlyTarget(rule.calculationType, rawTarget, source.months.length)
        const rawCompliance = actual !== null && target !== null && target !== 0 ? actual / target : null
        const recognizedCompliance = clampCompliance(rawCompliance, cap)
        return {
          month,
          actual,
          target,
          rawCompliance,
          recognizedCompliance,
          contribution: recognizedCompliance === null ? null : recognizedCompliance * weight,
        }
      })

      return {
        id: rule.indicatorId,
        label,
        row,
        calculationType: rule.calculationType,
        formula,
        weight,
        cap,
        targetThreshold: threshold,
        rawTarget,
        criterion,
        monthValues: Object.fromEntries(source.months.map((month, index) => [month, monthValues[index]])),
        monthly,
        quarter: {
          actual: qActual,
          target: qTarget,
          rawCompliance: quarterCompliance,
          recognizedCompliance: quarterCompliance,
          contribution: quarterContribution,
        },
      }
    })

    const calculatedQuarterResult = indicators.reduce((sum, indicator) => sum + (indicator.quarter.contribution ?? 0), 0)
    const originalQuarterResult = meta.result ?? resultReference?.result ?? null
    const difference = originalQuarterResult === null ? null : Math.abs(calculatedQuarterResult - originalQuarterResult)

    sources.push({
      id: `${source.sourceKey}-${source.configuredProfile}-${source.year}-${source.quarter}`,
      sourceKey: source.sourceKey,
      company: source.company,
      report: source.report,
      profile: inferProfile(meta.cargo ?? resultReference?.cargo, source.configuredProfile),
      configuredProfile: source.configuredProfile,
      year: source.year,
      quarter: source.quarter,
      months: source.months,
      sourceFile: source.sourceFile,
      workspaceId: source.workspaceId,
      reportId: source.reportId,
      person: meta.name ?? resultReference?.name ?? "Sin nombre",
      cargo: meta.cargo ?? resultReference?.cargo ?? null,
      territory: meta.territory ?? resultReference?.territory ?? null,
      companyExcel: meta.company ?? resultReference?.companyExcel ?? null,
      originalQuarterResult,
      calculatedQuarterResult,
      validationDifference: difference,
      validationStatus: difference !== null && difference <= 0.0001 ? "Coincide" : resultReference?.validationStatus ?? "Revisar",
      warning: resultReference?.warning ?? "",
      indicators,
    })
  } catch (error) {
    errors.push(`${source.sourceFile}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope: "Resultados individuales",
      source: "Excel de validación; Power BI será la fuente posterior de gestión real",
      reports: Object.entries(config.report_map).map(([key, value]) => ({ key, ...value })),
      sources,
      errors,
    },
    null,
    2,
  ),
)

console.log(`Generado ${path.relative(root, outputPath)}`)
console.log(`Fuentes: ${sources.length}; errores: ${errors.length}`)
for (const source of sources) {
  console.log(`${source.report} | ${source.profile} | ${source.quarter} | ${source.person} | ${(source.originalQuarterResult * 100).toFixed(4)}% | ${source.validationStatus}`)
}

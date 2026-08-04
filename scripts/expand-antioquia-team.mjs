import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import * as XLSX from "xlsx"

XLSX.set_fs(fs)

const root = process.cwd()
const sourcesDir = path.join(root, "data", "fuentes")
const dataPath = path.join(root, "data", "generated", "individual-c4c.json")

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"))

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const key = (value) => normalize(value).replace(/\s+/g, "")

const number = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? "").replace(/,/g, "."))
  return Number.isFinite(parsed) ? parsed : 0
}

const roundUp = (value) => Math.ceil(number(value))
const clamp = (value, cap) => Math.min(Math.max(number(value), 0), cap)
const safeDivide = (numerator, denominator) =>
  number(denominator) === 0 ? 0 : number(numerator) / number(denominator)

const rowsOf = (sheet) =>
  XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true })

const same = (left, right) => key(left) === key(right)

const sumWhere = (rows, valueIndex, criteria) =>
  rows.reduce((sum, row) => {
    const matches = criteria.every(([index, expected]) => same(row[index], expected))
    return matches ? sum + number(row[valueIndex]) : sum
  }, 0)

const valuesWhere = (rows, valueIndex, criteria) =>
  rows
    .filter((row) => criteria.every(([index, expected]) => same(row[index], expected)))
    .map((row) => number(row[valueIndex]))
    .filter((value) => Number.isFinite(value))

const uniqueSumWhere = (rows, valueIndex, criteria) =>
  [...new Set(valuesWhere(rows, valueIndex, criteria))].reduce((sum, value) => sum + value, 0)

const countWhere = (rows, criteria, nonBlankIndex = null) =>
  rows.filter((row) => {
    const matches = criteria.every(([index, expected]) => same(row[index], expected))
    const nonBlank = nonBlankIndex === null || String(row[nonBlankIndex] ?? "").trim() !== ""
    return matches && nonBlank
  }).length

const firstNumberWhere = (rows, valueIndex, criteria) => {
  const values = valuesWhere(rows, valueIndex, criteria)
  return values.length ? values[0] : 0
}

const maxWhere = (rows, valueIndex, criteria) => {
  const values = valuesWhere(rows, valueIndex, criteria)
  return values.length ? Math.max(...values) : 0
}

const profileFromCargo = (cargo) => {
  const text = normalize(cargo)
  if (text.includes("promotor")) return "Promotor"
  if (text.includes("director") || text.startsWith("dir ")) return "Director"
  return "Comercial"
}

const slug = (value) => normalize(value).replace(/\s+/g, "-")

const findTemplateIndicator = (template, aliases) => {
  const normalizedAliases = aliases.map((alias) => normalize(alias))
  return (
    template.indicators.find((indicator) =>
      normalizedAliases.includes(normalize(indicator.label)),
    ) ??
    template.indicators.find((indicator) => {
      const label = normalize(indicator.label)
      return normalizedAliases.some((alias) => label.includes(alias))
    })
  )
}

function makeIndicator({
  templateIndicator,
  label,
  actuals,
  rawTarget,
  quarterTarget,
  quarterActual,
  quarterCompliance,
  cap,
  monthlyTargets,
}) {
  const weight = number(templateIndicator?.weight)
  const threshold = number(templateIndicator?.targetThreshold || 0.9)
  const criterion = templateIndicator?.criterion ?? ""
  const calculationType = templateIndicator?.calculationType ?? "ratio"
  const formula = templateIndicator?.formula ?? ""
  const months = actuals.map((actual, index) => {
    const target = number(monthlyTargets[index])
    const rawCompliance = safeDivide(actual, target)
    const recognizedCompliance =
      typeof cap === "number" && Number.isFinite(cap)
        ? clamp(rawCompliance, cap)
        : Math.max(rawCompliance, 0)
    return {
      month: null,
      actual: number(actual),
      target,
      rawCompliance,
      recognizedCompliance,
      contribution: recognizedCompliance * weight,
    }
  })

  return {
    id: templateIndicator?.id ?? slug(label),
    label,
    row: templateIndicator?.row ?? null,
    calculationType,
    formula,
    weight,
    cap,
    targetThreshold: threshold,
    rawTarget: number(rawTarget),
    criterion,
    monthValues: {},
    monthly: months,
    quarter: {
      actual: number(quarterActual),
      target: number(quarterTarget),
      rawCompliance: number(quarterCompliance),
      recognizedCompliance: number(quarterCompliance),
      contribution: number(quarterCompliance) * weight,
    },
  }
}

function buildPersonSource(source, workbook, person) {
  const managementSheet = workbook.Sheets["Tabla dinam gestion comercial"]
  const technicalSheet = workbook.Sheets.Tecnico
  const leadsSheet = workbook.Sheets.Leads
  const fieldSheet = workbook.Sheets["Act Campo"]
  const farmsSheet = workbook.Sheets.Fincas
  const monthlySheet = workbook.Sheets.mensual

  const management = rowsOf(managementSheet)
  const technical = rowsOf(technicalSheet)
  const leads = rowsOf(leadsSheet)
  const field = rowsOf(fieldSheet)
  const farms = rowsOf(farmsSheet)

  const months = source.months
  const personCriteria = [[1, person.name]]
  const territoryCriteria = [[0, person.territory]]

  const visitActuals = months.map((month) => sumWhere(management, 5, [...personCriteria, [10, month]]))
  const coverageActuals = months.map((month) => sumWhere(management, 3, [...personCriteria, [10, month]]))

  const visitTargetFormula = String(monthlySheet[`J${findTemplateIndicator(source, ["ejecucion visitas"])?.row}`]?.f ?? "")
  const visitTarget = visitTargetFormula.includes("UNIQUE")
    ? months.reduce(
        (sum, month) => sum + uniqueSumWhere(management, 11, [...personCriteria, [10, month]]),
        0,
      ) / months.length
    : sumWhere(management, 11, personCriteria) / months.length

  const coverageTarget = sumWhere(management, 2, personCriteria) / months.length

  const newTemplate = findTemplateIndicator(source, ["nuevos clientes", "clientes nuevos"])
  const newMonthFormula = String(monthlySheet[`G${newTemplate?.row}`]?.f ?? "")
  const divideNewByThree = /\/\s*3(?:\D|$)/.test(newMonthFormula)
  const newActuals = months.map((month) => {
    const value = sumWhere(management, 8, [...personCriteria, [10, month]])
    return divideNewByThree ? value / 3 : value
  })
  const newTarget = roundUp(sumWhere(management, 7, personCriteria) / 12)
  // Clientes nuevos es un indicador acumulado:
  // se toma el mayor acumulado registrado y se compara contra la meta de los meses evaluados.
  const newQuarterActual = Math.max(...newActuals, 0)
  const newQuarterTarget = newTarget * months.length
  const newCompliance = clamp(safeDivide(newQuarterActual, newQuarterTarget), 1.5)

  const recommendationActuals = months.map((month) =>
    sumWhere(technical, 3, [...territoryCriteria, [10, month]]),
  )
  const recommendationTarget = sumWhere(technical, 2, territoryCriteria)

  const referenceActuals = months.map((month) =>
    sumWhere(technical, 9, [...territoryCriteria, [10, month]]),
  )
  const referenceTarget = sumWhere(technical, 7, territoryCriteria) / months.length

  const leadActuals = months.map((month) => sumWhere(leads, 3, [[2, person.name], [8, month]]))
  const timelyActuals = months.map((month) => sumWhere(leads, 4, [[2, person.name], [8, month]]))
  const leadTargets = leadActuals.map((value) => Math.max(1, value))
  const leadQuarterTarget = leadTargets.reduce((a, b) => a + b, 0)

  const activityActuals = months.map((month) =>
    countWhere(field, [[16, person.territory], [31, month]], 0),
  )
  const activityTarget = firstNumberWhere(management, 18, [[12, person.name]])

  const hectareActuals = months.map((month) =>
    sumWhere(farms, 5, [[1, person.territory], [6, month]]),
  )
  const hectareTarget = roundUp(maxWhere(management, 19, [[12, person.name]]) * months.length)

  const cropActuals = months.map((month) =>
    countWhere(farms, [[1, person.territory], [6, month]], 3),
  )
  const cropTarget = roundUp(sumWhere(management, 20, [[12, person.name]]))

  const definitions = [
    {
      aliases: ["ejecucion visitas"],
      label: "Ejecución visitas",
      actuals: visitActuals,
      rawTarget: visitTarget,
      quarterTarget: visitTarget * months.length,
      quarterActual: visitActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(visitActuals.reduce((a, b) => a + b, 0), visitTarget * months.length), 1),
      cap: 1,
      monthlyTargets: months.map(() => visitTarget),
    },
    {
      aliases: ["cobertura clientes"],
      label: "Cobertura clientes",
      actuals: coverageActuals,
      rawTarget: coverageTarget,
      quarterTarget: coverageTarget * months.length,
      quarterActual: coverageActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(coverageActuals.reduce((a, b) => a + b, 0), coverageTarget * months.length), 1),
      cap: 1,
      monthlyTargets: months.map(() => coverageTarget),
    },
    {
      aliases: ["nuevos clientes", "clientes nuevos"],
      label: newTemplate?.label ?? "Nuevos clientes",
      actuals: newActuals,
      rawTarget: newTarget,
      quarterTarget: newQuarterTarget,
      quarterActual: newQuarterActual,
      compliance: newCompliance,
      cap: 1.5,
      calculationType: "ratio_acumulado",
      formula: "MIN(150%, acumulado máximo / meta trimestral)",
      monthlyTargets: months.map(() => newTarget),
    },
    {
      aliases: ["recomendaciones", "recomendados"],
      label: "Recomendaciones",
      actuals: recommendationActuals,
      rawTarget: recommendationTarget,
      quarterTarget: recommendationTarget,
      quarterActual: recommendationActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(recommendationActuals.reduce((a, b) => a + b, 0), recommendationTarget), 1.5),
      cap: 1.5,
      monthlyTargets: months.map(() => recommendationTarget / months.length),
    },
    {
      aliases: ["referencias"],
      label: "Referencias",
      actuals: referenceActuals,
      rawTarget: referenceTarget,
      quarterTarget: referenceTarget,
      quarterActual: referenceActuals.reduce((a, b) => a + b, 0),
      compliance: safeDivide(referenceActuals.reduce((a, b) => a + b, 0), referenceTarget),
      cap: null,
      monthlyTargets: months.map(() => referenceTarget),
    },
    {
      aliases: ["leads calificados"],
      label: "Leads calificados",
      actuals: leadActuals,
      rawTarget: leadQuarterTarget,
      quarterTarget: leadQuarterTarget,
      quarterActual: leadActuals.reduce((a, b) => a + b, 0),
      compliance: safeDivide(leadActuals.reduce((a, b) => a + b, 0), leadQuarterTarget),
      cap: 1,
      monthlyTargets: leadTargets,
    },
    {
      aliases: ["leads calificados a tiempo"],
      label: "Leads calificados a tiempo",
      actuals: timelyActuals,
      rawTarget: leadQuarterTarget,
      quarterTarget: leadQuarterTarget,
      quarterActual: timelyActuals.reduce((a, b) => a + b, 0),
      compliance: safeDivide(timelyActuals.reduce((a, b) => a + b, 0), leadQuarterTarget),
      cap: 1,
      monthlyTargets: leadTargets,
    },
    {
      aliases: ["impacto en clientes"],
      label: "Impacto en clientes (Actividades de campo)",
      actuals: activityActuals,
      rawTarget: activityTarget,
      quarterTarget: activityTarget,
      quarterActual: activityActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(activityActuals.reduce((a, b) => a + b, 0), activityTarget), 1.5),
      cap: 1.5,
      monthlyTargets: months.map(() => activityTarget / months.length),
    },
    {
      aliases: ["hectareas de cultivos impactados", "hectareas cultivos impactados"],
      label: "Hectáreas de cultivos impactados",
      actuals: hectareActuals,
      rawTarget: hectareTarget,
      quarterTarget: hectareTarget,
      quarterActual: hectareActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(hectareActuals.reduce((a, b) => a + b, 0), hectareTarget), 1.5),
      cap: 1.5,
      monthlyTargets: months.map(() => hectareTarget / months.length),
    },
    {
      aliases: ["cultivos impactados"],
      label: "Cultivos impactados",
      actuals: cropActuals,
      rawTarget: cropTarget,
      quarterTarget: cropTarget,
      quarterActual: cropActuals.reduce((a, b) => a + b, 0),
      compliance: clamp(safeDivide(cropActuals.reduce((a, b) => a + b, 0), cropTarget), 1.5),
      cap: 1.5,
      monthlyTargets: months.map(() => cropTarget / months.length),
    },
  ]

  const indicators = definitions.map((definition) => {
    const templateIndicator = findTemplateIndicator(source, definition.aliases)
    const indicator = makeIndicator({
      templateIndicator,
      label: definition.label,
      actuals: definition.actuals,
      rawTarget: definition.rawTarget,
      quarterTarget: definition.quarterTarget,
      quarterActual: definition.quarterActual,
      quarterCompliance: definition.compliance,
      cap: definition.cap,
      monthlyTargets: definition.monthlyTargets,
    })

    if (definition.calculationType) {
      indicator.calculationType = definition.calculationType
    }

    if (definition.formula) {
      indicator.formula = definition.formula
    }

    indicator.monthValues = Object.fromEntries(months.map((month, index) => [month, definition.actuals[index]]))
    indicator.monthly = indicator.monthly.map((item, index) => ({ ...item, month: months[index] }))
    return indicator
  })

  const cropManagement = {
    id: "gestion-cultivos-impactados",
    label: "Gestión de Cultivos Impactados",
    row: null,
    calculationType: "promedio",
    formula: "Promedio de hectáreas y cultivos impactados",
    weight: 0,
    cap: 1.5,
    targetThreshold: 0.9,
    rawTarget: null,
    criterion: "Promedio del cumplimiento de hectáreas y cultivos impactados.",
    monthValues: {},
    monthly: [],
    quarter: {
      actual: null,
      target: null,
      rawCompliance: (indicators[8].quarter.recognizedCompliance + indicators[9].quarter.recognizedCompliance) / 2,
      recognizedCompliance: (indicators[8].quarter.recognizedCompliance + indicators[9].quarter.recognizedCompliance) / 2,
      contribution: 0,
    },
  }

  indicators.push(cropManagement)

  const calculatedQuarterResult = indicators.reduce(
    (sum, indicator) => sum + number(indicator.quarter.contribution),
    0,
  )

  return {
    ...source,
    id: `${source.sourceKey}-${person.profile}-${source.year}-${source.quarter}-${slug(person.name)}`,
    profile: person.profile,
    configuredProfile: person.profile,
    person: person.name,
    cargo: person.cargo,
    territory: person.territory,
    companyExcel: person.company || source.companyExcel,
    originalQuarterResult: calculatedQuarterResult,
    calculatedQuarterResult,
    validationDifference: 0,
    validationStatus: "Calculado",
    warning: "Calculado directamente desde las hojas base del Excel para el colaborador seleccionado.",
    indicators,
  }
}

const templateSources = data.sources.filter(
  (source) =>
    ["PYC-AGR-ANT", "GAL-ANT"].includes(source.sourceKey) &&
    source.profile !== "Director",
)

const expandedSources = []

for (const source of templateSources) {
  const filePath = path.join(sourcesDir, source.sourceFile)
  const workbook = XLSX.readFile(filePath, { cellDates: true, cellFormula: true })
  const management = rowsOf(workbook.Sheets["Tabla dinam gestion comercial"])
  const people = new Map()

  for (const row of management.slice(1)) {
    const name = String(row[12] ?? "").trim()
    const territory = String(row[13] ?? "").trim()
    const cargo = String(row[14] ?? "").trim()
    const company = String(row[15] ?? "").trim()
    const profile = profileFromCargo(cargo)
    const nameText = normalize(name)

    if (!name || !territory || !cargo) continue
    if (profile === "Director") continue
    if (nameText.includes("vacante")) continue
    if (nameText.startsWith("rtc agricola ant uraba")) continue

    people.set(key(name), { name, territory, cargo, company, profile })
  }

  for (const person of people.values()) {
    expandedSources.push(buildPersonSource(source, workbook, person))
  }
}

const preservedSources = data.sources.filter(
  (source) =>
    !["PYC-AGR-ANT", "GAL-ANT"].includes(source.sourceKey) ||
    source.profile === "Director",
)

data.sources = [...preservedSources, ...expandedSources]
data.scope = "Resultados individuales y de dirección"
data.generatedAt = new Date().toISOString()
data.teamExpansion = {
  enabled: true,
  generatedSources: expandedSources.length,
  excludedVacancies: true,
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8")

console.log(`Fuentes ampliadas: ${expandedSources.length}`)
console.log(`Total fuentes: ${data.sources.length}`)

for (const report of ["Agrícola Antioquia", "Galagro Antioquia"]) {
  for (const quarter of ["Q1", "Q2"]) {
    const subset = data.sources.filter(
      (source) => source.report === report && source.quarter === quarter,
    )
    const profiles = subset.reduce((acc, source) => {
      acc[source.profile] = (acc[source.profile] ?? 0) + 1
      return acc
    }, {})
    console.log(`${report} | ${quarter} | ${JSON.stringify(profiles)}`)
  }
}

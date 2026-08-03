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
  [...new Set(valuesWhere(rows, valueIndex, criteria))].reduce(
    (sum, value) => sum + value,
    0,
  )

const countWhere = (rows, criteria, nonBlankIndex = null) =>
  rows.filter((row) => {
    const matches = criteria.every(([index, expected]) => same(row[index], expected))
    const nonBlank =
      nonBlankIndex === null || String(row[nonBlankIndex] ?? "").trim() !== ""
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
  months,
}) {
  const weight = number(templateIndicator?.weight)
  const threshold = number(templateIndicator?.targetThreshold || 0.9)
  const criterion = templateIndicator?.criterion ?? ""
  const calculationType = templateIndicator?.calculationType ?? "ratio"
  const formula = templateIndicator?.formula ?? ""

  const monthly = actuals.map((actual, index) => {
    const target = number(monthlyTargets[index])
    const rawCompliance = safeDivide(actual, target)
    const recognizedCompliance =
      typeof cap === "number" && Number.isFinite(cap)
        ? clamp(rawCompliance, cap)
        : Math.max(rawCompliance, 0)

    return {
      month: months[index],
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
    monthValues: Object.fromEntries(
      months.map((month, index) => [month, number(actuals[index])]),
    ),
    monthly,
    quarter: {
      actual: number(quarterActual),
      target: number(quarterTarget),
      rawCompliance: number(quarterCompliance),
      recognizedCompliance: number(quarterCompliance),
      contribution: number(quarterCompliance) * weight,
    },
  }
}

function commonOperationalData(source, workbook, person, columns) {
  const management = rowsOf(workbook.Sheets["Tabla dinam gestion comercial"])
  const technical = rowsOf(workbook.Sheets.Tecnico)
  const leads = rowsOf(workbook.Sheets.Leads)
  const field = rowsOf(workbook.Sheets["Act Campo"])
  const farms = rowsOf(workbook.Sheets.Fincas)
  const months = source.months

  const personCriteria = [[1, person.name]]
  const territoryCriteria = [[0, person.territory]]

  const recommendationActuals = months.map((month) =>
    sumWhere(technical, 3, [...territoryCriteria, [10, month]]),
  )
  const recommendationTarget = sumWhere(technical, 2, territoryCriteria)

  const referenceActuals = months.map((month) =>
    sumWhere(technical, 9, [...territoryCriteria, [10, month]]),
  )
  const referenceTarget = sumWhere(technical, 7, territoryCriteria) / months.length

  const leadActuals = months.map((month) =>
    sumWhere(leads, 3, [[2, person.name], [8, month]]),
  )
  const timelyActuals = months.map((month) =>
    sumWhere(leads, 4, [[2, person.name], [8, month]]),
  )

  const standardLeadTargets = months.map((month) =>
    Math.max(1, sumWhere(leads, 3, [[2, person.name], [8, month]])),
  )
  const standardLeadQuarterTarget = standardLeadTargets.reduce(
    (sum, value) => sum + value,
    0,
  )

  const activityActuals = months.map((month) =>
    countWhere(field, [[16, person.territory], [31, month]]),
  )
  const activityTarget = firstNumberWhere(
    management,
    columns.activityTarget,
    [[columns.mappingName, person.name]],
  )

  const hectareActuals = months.map((month) =>
    sumWhere(farms, 5, [[1, person.territory], [6, month]]),
  )
  const hectareTarget = roundUp(
    maxWhere(management, columns.hectareTarget, [
      [columns.mappingName, person.name],
    ]) * months.length,
  )

  const cropActuals = months.map((month) =>
    countWhere(farms, [[1, person.territory], [6, month]], 3),
  )
  const cropTarget = roundUp(
    sumWhere(management, columns.cropTarget, [
      [columns.mappingName, person.name],
    ]),
  )

  return {
    management,
    months,
    personCriteria,
    recommendationActuals,
    recommendationTarget,
    referenceActuals,
    referenceTarget,
    leadActuals,
    timelyActuals,
    leads,
    standardLeadTargets,
    standardLeadQuarterTarget,
    activityActuals,
    activityTarget,
    hectareActuals,
    hectareTarget,
    cropActuals,
    cropTarget,
  }
}

function buildPromoterSource(source, workbook, person) {
  const columns = {
    mappingName: 14,
    activityTarget: 20,
    hectareTarget: 21,
    cropTarget: 22,
  }
  const common = commonOperationalData(source, workbook, person, columns)
  const { management, months, personCriteria } = common

  const visitActuals = months.map((month) =>
    sumWhere(management, 6, [...personCriteria, [11, month]]),
  )
  const visitTarget =
    months.reduce(
      (sum, month) =>
        sum + uniqueSumWhere(management, 12, [...personCriteria, [11, month]]),
      0,
    ) / months.length

  const coverageActuals = months.map((month) =>
    sumWhere(management, 3, [...personCriteria, [11, month]]),
  )
  const coverageTarget =
    sumWhere(management, 2, personCriteria) / months.length / months.length

  const newActuals = months.map((month) =>
    sumWhere(management, 9, [...personCriteria, [11, month]]),
  )
  const newTarget = roundUp(
    sumWhere(management, 8, personCriteria) / months.length,
  ) / 12
  const newQuarterActual =
    newActuals.reduce((sum, value) => sum + value, 0) / months.length
  const newCompliance = safeDivide(newQuarterActual, newTarget)

  const priorQuarterMonths = ["Enero", "Febrero", "Marzo"]
  const promoterLeadQuarterTarget =
    source.quarter === "Q2"
      ? Math.max(
          3,
          priorQuarterMonths.reduce(
            (sum, month) =>
              sum + countWhere(common.leads, [[2, person.name], [8, month]]),
            0,
          ),
        )
      : common.standardLeadQuarterTarget
  const promoterTimelyTargets =
    source.quarter === "Q2"
      ? priorQuarterMonths.map((month) =>
          Math.max(
            1,
            sumWhere(common.leads, 3, [[2, person.name], [8, month]]),
          ),
        )
      : common.standardLeadTargets
  const promoterTimelyQuarterTarget = promoterTimelyTargets.reduce(
    (sum, value) => sum + value,
    0,
  )
  const promoterLeadMonthlyTargets =
    source.quarter === "Q2"
      ? months.map(() => promoterLeadQuarterTarget / months.length)
      : common.standardLeadTargets

  const definitions = [
    {
      aliases: ["ejecucion visitas cliente final"],
      label: "Ejecución visitas Cliente Final",
      actuals: visitActuals,
      rawTarget: visitTarget,
      quarterTarget: visitTarget * months.length,
      quarterActual: visitActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          visitActuals.reduce((sum, value) => sum + value, 0),
          visitTarget * months.length,
        ),
        1,
      ),
      cap: 1,
      monthlyTargets: months.map(() => visitTarget),
    },
    {
      aliases: ["cobertura clientes"],
      label: "Cobertura clientes",
      actuals: coverageActuals,
      rawTarget: coverageTarget,
      quarterTarget: coverageTarget * months.length,
      quarterActual: coverageActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          coverageActuals.reduce((sum, value) => sum + value, 0),
          coverageTarget * months.length,
        ),
        1,
      ),
      cap: 1,
      monthlyTargets: months.map(() => coverageTarget),
    },
    {
      aliases: ["clientes nuevos", "nuevos clientes"],
      label: "Clientes Nuevos",
      actuals: newActuals,
      rawTarget: newTarget,
      quarterTarget: newTarget,
      quarterActual: newQuarterActual,
      compliance: newCompliance,
      cap: null,
      monthlyTargets: months.map(() => newTarget),
    },
    {
      aliases: ["recomendaciones"],
      label: "Recomendaciones",
      actuals: common.recommendationActuals,
      rawTarget: common.recommendationTarget,
      quarterTarget: common.recommendationTarget,
      quarterActual: common.recommendationActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.recommendationActuals.reduce((sum, value) => sum + value, 0),
          common.recommendationTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.recommendationTarget / months.length),
    },
    {
      aliases: ["referencias"],
      label: "Referencias",
      actuals: common.referenceActuals,
      rawTarget: common.referenceTarget,
      quarterTarget: common.referenceTarget,
      quarterActual:
        common.referenceActuals.reduce((sum, value) => sum + value, 0) /
        months.length,
      compliance: safeDivide(
        common.referenceActuals.reduce((sum, value) => sum + value, 0) /
          months.length,
        common.referenceTarget,
      ),
      cap: null,
      monthlyTargets: months.map(() => common.referenceTarget),
    },
    {
      aliases: ["leads calificados"],
      label: "Leads calificados",
      actuals: common.leadActuals,
      rawTarget: promoterLeadQuarterTarget,
      quarterTarget: promoterLeadQuarterTarget,
      quarterActual: common.leadActuals.reduce((sum, value) => sum + value, 0),
      compliance:
        source.quarter === "Q2"
          ? clamp(
              safeDivide(
                common.leadActuals.reduce((sum, value) => sum + value, 0),
                promoterLeadQuarterTarget,
              ),
              1,
            )
          : safeDivide(
              common.leadActuals.reduce((sum, value) => sum + value, 0),
              promoterLeadQuarterTarget,
            ),
      cap: source.quarter === "Q2" ? 1 : null,
      monthlyTargets: promoterLeadMonthlyTargets,
    },
    {
      aliases: ["leads calificados a tiempo"],
      label: "Leads calificados a tiempo",
      actuals: common.timelyActuals,
      rawTarget: promoterTimelyQuarterTarget,
      quarterTarget: promoterTimelyQuarterTarget,
      quarterActual: common.timelyActuals.reduce((sum, value) => sum + value, 0),
      compliance: safeDivide(
        common.timelyActuals.reduce((sum, value) => sum + value, 0),
        promoterTimelyQuarterTarget,
      ),
      cap: null,
      monthlyTargets: promoterTimelyTargets,
    },
    {
      aliases: ["impacto en clientes"],
      label: "Impacto en clientes (Actividades de campo)",
      actuals: common.activityActuals,
      rawTarget: common.activityTarget,
      quarterTarget: common.activityTarget,
      quarterActual: common.activityActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.activityActuals.reduce((sum, value) => sum + value, 0),
          common.activityTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.activityTarget / months.length),
    },
    {
      aliases: ["hectareas de cultivos impactados", "hectareas cultivos impactados"],
      label: "Hectáreas de cultivos impactados",
      actuals: common.hectareActuals,
      rawTarget: common.hectareTarget,
      quarterTarget: common.hectareTarget,
      quarterActual: common.hectareActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.hectareActuals.reduce((sum, value) => sum + value, 0),
          common.hectareTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.hectareTarget / months.length),
    },
    {
      aliases: ["cultivos impactados"],
      label: "Cultivos impactados",
      actuals: common.cropActuals,
      rawTarget: common.cropTarget,
      quarterTarget: common.cropTarget,
      quarterActual: common.cropActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.cropActuals.reduce((sum, value) => sum + value, 0),
          common.cropTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.cropTarget / months.length),
    },
  ]

  return buildSourceFromDefinitions(source, person, definitions)
}

function buildCommercialSource(source, workbook, person) {
  const columns = {
    mappingName: 15,
    activityTarget: 21,
    hectareTarget: 22,
    cropTarget: 23,
  }
  const common = commonOperationalData(source, workbook, person, columns)
  const { management, months, personCriteria } = common

  const finalCoverageActuals = months.map((month) =>
    sumWhere(management, 6, [...personCriteria, [11, month]]),
  )

  const finalCoverageTarget =
    (uniqueSumWhere(management, 5, [...personCriteria, [11, months[0]]]) +
      uniqueSumWhere(management, 12, [...personCriteria, [11, months[1]]]) +
      uniqueSumWhere(management, 12, [...personCriteria, [11, months[2]]])) /
    months.length

  const finalVisitActuals = months.map((month) =>
    sumWhere(management, 13, [...personCriteria, [11, month]]),
  )
  const finalVisitTarget =
    months.reduce(
      (sum, month) =>
        sum + uniqueSumWhere(management, 12, [...personCriteria, [11, month]]),
      0,
    ) / months.length

  const potentialActuals = months.map((month) =>
    sumWhere(management, 9, [...personCriteria, [11, month]]),
  )
  const potentialTarget = roundUp(
    sumWhere(management, 8, personCriteria) / months.length,
  )
  const potentialQuarterActual =
    potentialActuals.reduce((sum, value) => sum + value, 0) / months.length

  const newActuals = months.map(() => 0)
  const newTarget = 10
  const newQuarterActual = 0

  const definitions = [
    {
      aliases: ["ejecucion cobertura cliente final"],
      label: "Ejecución Cobertura Cliente Final",
      actuals: finalCoverageActuals,
      rawTarget: finalCoverageTarget,
      quarterTarget: finalCoverageTarget * months.length,
      quarterActual: finalCoverageActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          finalCoverageActuals.reduce((sum, value) => sum + value, 0),
          finalCoverageTarget * months.length,
        ),
        1,
      ),
      cap: 1,
      monthlyTargets: months.map(() => finalCoverageTarget),
    },
    {
      aliases: ["ejecucion visitas cliente final"],
      label: "Ejecución visitas cliente final",
      actuals: finalVisitActuals,
      rawTarget: finalVisitTarget,
      quarterTarget: finalVisitTarget * months.length,
      quarterActual: finalVisitActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          finalVisitActuals.reduce((sum, value) => sum + value, 0),
          finalVisitTarget * months.length,
        ),
        1,
      ),
      cap: 1,
      monthlyTargets: months.map(() => finalVisitTarget),
    },
    {
      aliases: ["cobertura cliente potencial"],
      label: "Cobertura Cliente Potencial",
      actuals: potentialActuals,
      rawTarget: potentialTarget,
      quarterTarget: potentialTarget,
      quarterActual: potentialQuarterActual,
      compliance: safeDivide(potentialQuarterActual, potentialTarget),
      cap: null,
      monthlyTargets: months.map(() => potentialTarget),
    },
    {
      aliases: ["ejecucion clientes nuevos", "clientes nuevos"],
      label: "Ejecución clientes nuevos",
      actuals: newActuals,
      rawTarget: newTarget,
      quarterTarget: newTarget,
      quarterActual: newQuarterActual,
      compliance: 0,
      cap: null,
      monthlyTargets: months.map(() => newTarget),
    },
    {
      aliases: ["recomendaciones"],
      label: "Recomendaciones",
      actuals: common.recommendationActuals,
      rawTarget: common.recommendationTarget,
      quarterTarget: common.recommendationTarget,
      quarterActual: common.recommendationActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.recommendationActuals.reduce((sum, value) => sum + value, 0),
          common.recommendationTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.recommendationTarget / months.length),
    },
    {
      aliases: ["referencias"],
      label: "Referencias",
      actuals: common.referenceActuals,
      rawTarget: common.referenceTarget,
      quarterTarget: common.referenceTarget,
      quarterActual:
        common.referenceActuals.reduce((sum, value) => sum + value, 0) /
        months.length,
      compliance: safeDivide(
        common.referenceActuals.reduce((sum, value) => sum + value, 0) /
          months.length,
        common.referenceTarget,
      ),
      cap: null,
      monthlyTargets: months.map(() => common.referenceTarget),
    },
    {
      aliases: ["leads calificados"],
      label: "Leads calificados",
      actuals: common.leadActuals,
      rawTarget: common.standardLeadQuarterTarget,
      quarterTarget: common.standardLeadQuarterTarget,
      quarterActual: common.leadActuals.reduce((sum, value) => sum + value, 0),
      compliance: safeDivide(
        common.leadActuals.reduce((sum, value) => sum + value, 0),
        common.standardLeadQuarterTarget,
      ),
      cap: null,
      monthlyTargets: common.standardLeadTargets,
    },
    {
      aliases: ["leads calificados a tiempo"],
      label: "Leads calificados a tiempo",
      actuals: common.timelyActuals,
      rawTarget: common.standardLeadQuarterTarget,
      quarterTarget: common.standardLeadQuarterTarget,
      quarterActual: common.timelyActuals.reduce((sum, value) => sum + value, 0),
      compliance: safeDivide(
        common.timelyActuals.reduce((sum, value) => sum + value, 0),
        common.standardLeadQuarterTarget,
      ),
      cap: null,
      monthlyTargets: common.standardLeadTargets,
    },
    {
      aliases: ["impacto en clientes"],
      label: "Impacto en clientes (Actividades de campo)",
      actuals: common.activityActuals,
      rawTarget: common.activityTarget,
      quarterTarget: common.activityTarget,
      quarterActual: common.activityActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.activityActuals.reduce((sum, value) => sum + value, 0),
          common.activityTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.activityTarget / months.length),
    },
    {
      aliases: ["hectareas de cultivos impactados", "hectareas cultivos impactados"],
      label: "Hectáreas de cultivos impactados",
      actuals: common.hectareActuals,
      rawTarget: common.hectareTarget,
      quarterTarget: common.hectareTarget,
      quarterActual: common.hectareActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.hectareActuals.reduce((sum, value) => sum + value, 0),
          common.hectareTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.hectareTarget / months.length),
    },
    {
      aliases: ["cultivos impactados"],
      label: "Cultivos impactados",
      actuals: common.cropActuals,
      rawTarget: common.cropTarget,
      quarterTarget: common.cropTarget,
      quarterActual: common.cropActuals.reduce((sum, value) => sum + value, 0),
      compliance: clamp(
        safeDivide(
          common.cropActuals.reduce((sum, value) => sum + value, 0),
          common.cropTarget,
        ),
        1.5,
      ),
      cap: 1.5,
      monthlyTargets: months.map(() => common.cropTarget / months.length),
    },
  ]

  return buildSourceFromDefinitions(source, person, definitions)
}

function buildSourceFromDefinitions(source, person, definitions) {
  const indicators = definitions.map((definition) => {
    const templateIndicator = findTemplateIndicator(source, definition.aliases)
    return makeIndicator({
      templateIndicator,
      label: templateIndicator?.label ?? definition.label,
      actuals: definition.actuals,
      rawTarget: definition.rawTarget,
      quarterTarget: definition.quarterTarget,
      quarterActual: definition.quarterActual,
      quarterCompliance: definition.compliance,
      cap: definition.cap,
      monthlyTargets: definition.monthlyTargets,
      months: source.months,
    })
  })

  const hectareIndex = indicators.findIndex((indicator) =>
    normalize(indicator.label).includes("hectareas"),
  )
  const cropIndex = indicators.findIndex(
    (indicator) => normalize(indicator.label) === "cultivos impactados",
  )

  if (hectareIndex >= 0 && cropIndex >= 0) {
    indicators.push({
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
        rawCompliance:
          (indicators[hectareIndex].quarter.recognizedCompliance +
            indicators[cropIndex].quarter.recognizedCompliance) /
          2,
        recognizedCompliance:
          (indicators[hectareIndex].quarter.recognizedCompliance +
            indicators[cropIndex].quarter.recognizedCompliance) /
          2,
        contribution: 0,
      },
    })
  }

  const calculatedQuarterResult = indicators.reduce(
    (sum, indicator) => sum + number(indicator.quarter.contribution),
    0,
  )

  const isOriginalPerson = same(person.name, source.person)
  const originalQuarterResult = isOriginalPerson
    ? number(source.originalQuarterResult)
    : calculatedQuarterResult
  const validationDifference = Math.abs(
    calculatedQuarterResult - originalQuarterResult,
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
    originalQuarterResult,
    calculatedQuarterResult,
    validationDifference,
    validationStatus:
      isOriginalPerson && validationDifference <= 0.0001
        ? source.validationStatus
        : "Calculado",
    warning:
      "Calculado directamente desde las hojas base del Excel para el colaborador seleccionado.",
    indicators,
  }
}

function extractPeople(source, workbook) {
  const management = rowsOf(workbook.Sheets["Tabla dinam gestion comercial"])
  const isPromoter = source.profile === "Promotor"
  const columns = isPromoter
    ? { name: 14, territory: 15, cargo: 16, company: 17 }
    : { name: 15, territory: 16, cargo: 17, company: 18 }
  const people = new Map()

  for (const row of management.slice(1)) {
    const name = String(row[columns.name] ?? "").replace(/\s+/g, " ").trim()
    const territory = String(row[columns.territory] ?? "")
      .replace(/\s+/g, " ")
      .trim()
    const cargo = String(row[columns.cargo] ?? "").replace(/\s+/g, " ").trim()
    const company = String(row[columns.company] ?? "")
      .replace(/\s+/g, " ")
      .trim()
    const text = normalize(`${name} ${cargo}`)

    if (!name || !territory || !cargo) continue
    if (normalize(company) !== "galagro") continue
    if (normalize(name) === "comercial") continue
    if (normalize(name).includes("cant clientes nuevos")) continue
    if (normalize(name).includes("vacante")) continue
    if (text.includes("director") || normalize(cargo).startsWith("dir ")) continue

    if (isPromoter && !normalize(cargo).includes("promotor")) continue
    if (!isPromoter && normalize(cargo).includes("promotor")) continue

    people.set(key(name), {
      name,
      territory,
      cargo,
      company,
      profile: source.profile,
    })
  }

  return [...people.values()]
}

const templateSources = data.sources.filter(
  (source) => source.sourceKey === "GAL-NAC" && ["Comercial", "Promotor"].includes(source.profile),
)

const expandedSources = []

for (const source of templateSources) {
  const filePath = path.join(sourcesDir, source.sourceFile)
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    cellFormula: true,
  })
  const people = extractPeople(source, workbook)

  for (const person of people) {
    expandedSources.push(
      source.profile === "Promotor"
        ? buildPromoterSource(source, workbook, person)
        : buildCommercialSource(source, workbook, person),
    )
  }
}

const preservedSources = data.sources.filter(
  (source) => source.sourceKey !== "GAL-NAC",
)

data.sources = [...preservedSources, ...expandedSources]
data.scope = "Resultados individuales y de dirección"
data.generatedAt = new Date().toISOString()
data.nationalTeamExpansion = {
  enabled: true,
  generatedSources: expandedSources.length,
  excludedVacancies: true,
  excludedDirector: true,
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8")

console.log(`Fuentes nacionales ampliadas: ${expandedSources.length}`)
console.log(`Total fuentes: ${data.sources.length}`)

for (const quarter of ["Q1", "Q2"]) {
  const subset = data.sources.filter(
    (source) => source.report === "Galagro Nacional" && source.quarter === quarter,
  )
  const profiles = subset.reduce((acc, source) => {
    acc[source.profile] = (acc[source.profile] ?? 0) + 1
    return acc
  }, {})
  console.log(`Galagro Nacional | ${quarter} | ${JSON.stringify(profiles)}`)
}

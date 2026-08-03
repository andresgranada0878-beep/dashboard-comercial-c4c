import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const dataPath = path.join(root, "data", "generated", "individual-c4c.json")
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"))

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const number = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

const mean = (values) => {
  const valid = values.filter((value) => Number.isFinite(value))
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : 0
}

const findIndicator = (source, aliases) => {
  const normalizedAliases = aliases.map(normalize)

  return (
    source.indicators.find((indicator) =>
      normalizedAliases.includes(normalize(indicator.label)),
    ) ??
    source.indicators.find((indicator) => {
      const label = normalize(indicator.label)
      return normalizedAliases.some((alias) => label.includes(alias))
    })
  )
}

const recognizedQuarter = (indicator) =>
  Number.isFinite(indicator?.quarter?.recognizedCompliance)
    ? indicator.quarter.recognizedCompliance
    : null

const recognizedMonth = (indicator, monthIndex) =>
  Number.isFinite(indicator?.monthly?.[monthIndex]?.recognizedCompliance)
    ? indicator.monthly[monthIndex].recognizedCompliance
    : null

function personMetric(source, metric, monthIndex = null) {
  const pick = (aliases) => findIndicator(source, aliases)
  const value = (indicator) =>
    monthIndex === null
      ? recognizedQuarter(indicator)
      : recognizedMonth(indicator, monthIndex)

  if (metric === "coverage") {
    if (source.profile === "Promotor") {
      return value(pick(["Cobertura clientes"]))
    }

    const finalCoverage = value(
      pick(["Ejecución Cobertura Cliente Final"]),
    )
    const potentialCoverage = value(
      pick(["Cobertura Cliente Potencial"]),
    )

    return mean(
      [finalCoverage, potentialCoverage].filter((item) => item !== null),
    )
  }

  const aliasesByMetric = {
    newClients: ["Clientes Nuevos", "Ejecución clientes nuevos"],
    recommendations: ["Recomendaciones", "Recomendados"],
    references: ["Referencias"],
    fieldImpact: ["Impacto en clientes"],
    hectares: ["Hectáreas de cultivos impactados", "Hectareas de cultivos impactados"],
    crops: ["Cultivos impactados"],
  }

  return value(pick(aliasesByMetric[metric] ?? []))
}

function makeOwnIndicator({
  template,
  label,
  months,
  actuals,
  monthlyTarget,
  cap,
  criterion,
}) {
  const weight = number(template?.weight)
  const quarterActual = actuals.reduce((sum, value) => sum + value, 0)
  const quarterTarget = monthlyTarget * months.length
  const rawQuarterCompliance = quarterTarget ? quarterActual / quarterTarget : 0
  const quarterCompliance =
    typeof cap === "number"
      ? Math.min(Math.max(rawQuarterCompliance, 0), cap)
      : Math.max(rawQuarterCompliance, 0)

  const monthly = months.map((month, index) => {
    const rawCompliance = monthlyTarget ? actuals[index] / monthlyTarget : 0
    const recognizedCompliance =
      typeof cap === "number"
        ? Math.min(Math.max(rawCompliance, 0), cap)
        : Math.max(rawCompliance, 0)

    return {
      month,
      actual: actuals[index],
      target: monthlyTarget,
      rawCompliance,
      recognizedCompliance,
      contribution: recognizedCompliance * weight,
    }
  })

  return {
    id: template?.id ?? normalize(label).replace(/\s+/g, "-"),
    label,
    row: template?.row ?? null,
    calculationType: template?.calculationType ?? "ratio",
    formula: `SUMA gestión propia / (${monthlyTarget} × ${months.length} meses)`,
    weight,
    cap,
    targetThreshold: number(template?.targetThreshold || 0.9),
    rawTarget: monthlyTarget,
    criterion,
    monthValues: Object.fromEntries(
      months.map((month, index) => [month, actuals[index]]),
    ),
    monthly,
    quarter: {
      actual: quarterActual,
      target: quarterTarget,
      rawCompliance: rawQuarterCompliance,
      recognizedCompliance: quarterCompliance,
      contribution: quarterCompliance * weight,
    },
  }
}

function makeAverageIndicator({
  template,
  label,
  months,
  members,
  metric,
  criterion,
}) {
  const weight = number(template?.weight)
  const cap = Number.isFinite(template?.cap) ? template.cap : null

  const monthlyCompliance = months.map((_, monthIndex) =>
    mean(
      members
        .map((source) => personMetric(source, metric, monthIndex))
        .filter((value) => value !== null),
    ),
  )

  const rawQuarterCompliance = mean(
    members
      .map((source) => personMetric(source, metric))
      .filter((value) => value !== null),
  )

  const quarterCompliance =
    typeof cap === "number"
      ? Math.min(Math.max(rawQuarterCompliance, 0), cap)
      : Math.max(rawQuarterCompliance, 0)

  const monthly = months.map((month, index) => {
    const rawCompliance = monthlyCompliance[index]
    const recognizedCompliance =
      typeof cap === "number"
        ? Math.min(Math.max(rawCompliance, 0), cap)
        : Math.max(rawCompliance, 0)

    return {
      month,
      actual: recognizedCompliance * 100,
      target: 100,
      rawCompliance,
      recognizedCompliance,
      contribution: recognizedCompliance * weight,
    }
  })

  return {
    id: template?.id ?? normalize(label).replace(/\s+/g, "-"),
    label,
    row: template?.row ?? null,
    calculationType: "promedio_cumplimiento_equipo",
    formula: "Promedio simple del cumplimiento individual del equipo activo",
    weight,
    cap,
    targetThreshold: number(template?.targetThreshold || 0.9),
    rawTarget: 100,
    criterion,
    monthValues: Object.fromEntries(
      months.map((month, index) => [month, monthly[index].actual]),
    ),
    monthly,
    quarter: {
      actual: quarterCompliance * 100,
      target: 100,
      rawCompliance: rawQuarterCompliance,
      recognizedCompliance: quarterCompliance,
      contribution: quarterCompliance * weight,
    },
  }
}

function buildDirector(quarter) {
  const members = data.sources.filter(
    (source) =>
      source.report === "Galagro Nacional" &&
      source.quarter === quarter &&
      ["Comercial", "Promotor"].includes(source.profile),
  )

  const promoterTemplate = members.find((source) => source.profile === "Promotor")
  const sourceTemplate = promoterTemplate ?? members[0]

  if (!sourceTemplate) {
    throw new Error(`No se encontraron fuentes de Galagro Nacional ${quarter}.`)
  }

  const months = sourceTemplate.months
  const visitActuals =
    quarter === "Q1" ? [18, 10, 17] : [14, 16, 11]

  const indicators = [
    makeOwnIndicator({
      template: findIndicator(sourceTemplate, ["Ejecución visitas Cliente Final"]),
      label: "Ejecución visitas",
      months,
      actuals: visitActuals,
      monthlyTarget: 20,
      cap: 1,
      criterion:
        "Mide las visitas realizadas directamente por la Directora Nacional frente a una meta de 20 visitas mensuales.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Cobertura clientes"]),
      label: "Cobertura clientes",
      months,
      members,
      metric: "coverage",
      criterion:
        "Promedio simple del cumplimiento de cobertura de los 15 colaboradores activos. Para cada comercial se promedian primero la cobertura de cliente final y la cobertura de cliente potencial.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Clientes Nuevos"]),
      label: "Clientes nuevos",
      months,
      members,
      metric: "newClients",
      criterion:
        "Promedio simple del cumplimiento de clientes nuevos de comerciales y promotores activos.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Recomendaciones"]),
      label: "Recomendaciones",
      months,
      members,
      metric: "recommendations",
      criterion:
        "Promedio simple del cumplimiento de recomendaciones de comerciales y promotores activos.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Referencias"]),
      label: "Referencias",
      months,
      members,
      metric: "references",
      criterion:
        "Promedio simple del cumplimiento de referencias de comerciales y promotores activos.",
    }),
    makeOwnIndicator({
      template: findIndicator(sourceTemplate, ["Leads calificados"]),
      label: "Leads calificados",
      months,
      actuals: [0, 0, 0],
      monthlyTarget: 1,
      cap: 1,
      criterion:
        "Indicador propio de la Directora Nacional. No registró leads en el trimestre, por lo cual el cumplimiento es 0 %.",
    }),
    makeOwnIndicator({
      template: findIndicator(sourceTemplate, ["Leads calificados a tiempo"]),
      label: "Leads calificados a tiempo",
      months,
      actuals: [0, 0, 0],
      monthlyTarget: 1,
      cap: 1,
      criterion:
        "Indicador propio de la Directora Nacional. Al no registrar leads, el cumplimiento oportuno es 0 %.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Impacto en clientes"]),
      label: "Impacto en clientes (Actividades de campo)",
      months,
      members,
      metric: "fieldImpact",
      criterion:
        "Promedio simple del cumplimiento de actividades de campo de comerciales y promotores activos.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Hectáreas de cultivos impactados"]),
      label: "Hectáreas de cultivos impactados",
      months,
      members,
      metric: "hectares",
      criterion:
        "Promedio simple del cumplimiento de hectáreas impactadas de comerciales y promotores activos.",
    }),
    makeAverageIndicator({
      template: findIndicator(sourceTemplate, ["Cultivos impactados"]),
      label: "Cultivos impactados",
      months,
      members,
      metric: "crops",
      criterion:
        "Promedio simple del cumplimiento de cultivos impactados de comerciales y promotores activos.",
    }),
  ]

  const calculatedQuarterResult = indicators.reduce(
    (sum, indicator) => sum + number(indicator.quarter.contribution),
    0,
  )

  return {
    ...sourceTemplate,
    id: `GAL-NAC-Director-${sourceTemplate.year}-${quarter}-juana-andrea-moncaleano-sandoval`,
    profile: "Director",
    configuredProfile: "Director",
    person: "Juana Andrea Moncaleano Sandoval",
    cargo: "DIR GALAGRO NACIONAL",
    territory: "GALAGRO NACIONAL DIRECCIÓN",
    companyExcel: "GALAGRO",
    sourceFile: "Derivado de Galagro Nacional Comercial y Promotor",
    sheetName: "Director derivado",
    originalQuarterResult: calculatedQuarterResult,
    calculatedQuarterResult,
    validationDifference: 0,
    validationStatus: "Calculado",
    warning:
      "Visitas y leads corresponden a la gestión propia de Juana Andrea Moncaleano. Los demás indicadores son promedios simples del cumplimiento de 6 comerciales y 9 promotores activos.",
    indicators,
  }
}

data.sources = data.sources.filter(
  (source) =>
    !(
      source.report === "Galagro Nacional" &&
      source.profile === "Director"
    ),
)

const directors = [buildDirector("Q1"), buildDirector("Q2")]
data.sources.push(...directors)
data.generatedAt = new Date().toISOString()
data.nationalDirectorExpansion = {
  enabled: true,
  person: "Juana Andrea Moncaleano Sandoval",
  ownVisits: {
    Q1: [18, 10, 17],
    Q2: [14, 16, 11],
    monthlyTarget: 20,
  },
  ownLeads: 0,
  aggregation: "Promedio simple por colaborador activo",
  team: {
    commercial: 6,
    promoter: 9,
  },
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8")

for (const director of directors) {
  console.log(
    `Galagro Nacional | Director | ${director.quarter} | ${director.person} | ${(director.calculatedQuarterResult * 100).toFixed(4)}% | Calculado`,
  )
}

console.log(`Total fuentes: ${data.sources.length}`)

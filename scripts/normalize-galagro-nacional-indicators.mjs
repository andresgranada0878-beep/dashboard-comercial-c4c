import fs from "node:fs"

const DATA_FILE = "data/generated/individual-c4c.json"

const data = JSON.parse(
  fs.readFileSync(DATA_FILE, "utf8"),
)

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function canonicalDefinition(indicator) {
  const label = normalize(indicator.label)
  const id = normalize(indicator.id)

  if (
    id === "gestion-cultivos-impactados" ||
    id === "gestion_cultivos_impactados" ||
    label === "gestion de cultivos impactados"
  ) {
    return null
  }

  if (label === "ejecucion cobertura cliente final") {
    return {
      id: "cobertura_cliente_final",
      label: "Ejecución Cobertura Cliente Final",
    }
  }

  if (label === "ejecucion visitas cliente final") {
    return {
      id: "ejecucion_visitas_cliente_final",
      label: "Ejecución visitas cliente final",
    }
  }

  if (label === "cobertura cliente potencial") {
    return {
      id: "cobertura_cliente_potencial",
      label: "Cobertura Cliente Potencial",
    }
  }

  if (
    label === "ejecucion clientes nuevos" ||
    label === "clientes nuevos"
  ) {
    return {
      id: "nuevos_clientes",
      label: "Ejecución clientes nuevos",
    }
  }

  if (label === "recomendaciones") {
    return {
      id: "recomendaciones",
      label: "Recomendaciones",
    }
  }

  if (label === "referencias") {
    return {
      id: "referencias",
      label: "Referencias",
    }
  }

  if (label === "leads calificados a tiempo") {
    return {
      id: "leads_calificados_tiempo",
      label: "Leads calificados a tiempo",
    }
  }

  if (label === "leads calificados") {
    return {
      id: "leads_calificados",
      label: "Leads calificados",
    }
  }

  if (
    label.includes("impacto en clientes") ||
    label.includes("actividades de campo")
  ) {
    return {
      id: "actividades_campo",
      label: "Impacto en clientes (Actividades de campo)",
    }
  }

  if (label.includes("hectarea")) {
    return {
      id: "hectareas",
      label: "Hectáreas de cultivos impactados",
    }
  }

  if (
    label === "cultivos impactados" ||
    (
      label.includes("cultivos impactados") &&
      !label.includes("hectarea")
    )
  ) {
    return {
      id: "cultivos",
      label: "Cultivos impactados",
    }
  }

  return {
    id: indicator.id,
    label: indicator.label,
  }
}

const nationalSources = (data.sources ?? []).filter(
  (source) =>
    source.report === "Galagro Nacional" &&
    source.profile !== "Director",
)

/*
 * Q1 contiene la estructura correcta de pesos y tipos de cálculo.
 * Se construye una plantilla independiente para Comercial y Promotor.
 */
const metadataByProfile = new Map()

for (const source of nationalSources) {
  if (source.quarter !== "Q1") continue

  for (const indicator of source.indicators ?? []) {
    const canonical = canonicalDefinition(indicator)
    if (!canonical) continue

    const key = `${source.profile}|||${canonical.id}`
    const current = metadataByProfile.get(key)

    const candidate = {
      weight: indicator.weight,
      calculationType: indicator.calculationType,
      formula: indicator.formula,
      cap: indicator.cap,
      targetThreshold: indicator.targetThreshold,
      criterion: indicator.criterion,
    }

    if (
      !current ||
      Number(candidate.weight ?? 0) >
        Number(current.weight ?? 0)
    ) {
      metadataByProfile.set(key, candidate)
    }
  }
}

let correctedSources = 0
let removedAuxiliary = 0
let removedDuplicates = 0

for (const source of nationalSources) {
  const indicators = []
  const seenIds = new Set()

  for (const original of source.indicators ?? []) {
    const canonical = canonicalDefinition(original)

    if (!canonical) {
      removedAuxiliary++
      continue
    }

    const template = metadataByProfile.get(
      `${source.profile}|||${canonical.id}`,
    )

    const weight =
      template?.weight ?? original.weight ?? 0

    const monthly = (original.monthly ?? []).map(
      (metric) => ({
        ...metric,
        contribution:
          metric.recognizedCompliance === null ||
          metric.recognizedCompliance === undefined
            ? 0
            : metric.recognizedCompliance * weight,
      }),
    )

    const quarter = {
      ...original.quarter,
      contribution:
        original.quarter?.recognizedCompliance === null ||
        original.quarter?.recognizedCompliance === undefined
          ? 0
          : original.quarter.recognizedCompliance * weight,
    }

    const indicator = {
      ...original,
      id: canonical.id,
      label: canonical.label,
      weight,
      calculationType:
        template?.calculationType ??
        original.calculationType,
      formula: template?.formula ?? original.formula,
      cap:
        template?.cap !== undefined
          ? template.cap
          : original.cap,
      targetThreshold:
        template?.targetThreshold ??
        original.targetThreshold,
      criterion:
        template?.criterion ?? original.criterion,
      monthly,
      quarter,
    }

    if (seenIds.has(indicator.id)) {
      removedDuplicates++
      continue
    }

    seenIds.add(indicator.id)
    indicators.push(indicator)
  }

  source.indicators = indicators

  const calculatedQuarterResult = indicators.reduce(
    (sum, indicator) =>
      sum + (indicator.quarter?.contribution ?? 0),
    0,
  )

  source.calculatedQuarterResult =
    calculatedQuarterResult

  if (source.validationStatus === "Calculado") {
    source.originalQuarterResult =
      calculatedQuarterResult
    source.validationDifference = 0
  } else if (
    source.originalQuarterResult !== null &&
    source.originalQuarterResult !== undefined
  ) {
    source.validationDifference = Math.abs(
      calculatedQuarterResult -
        source.originalQuarterResult,
    )
  }

  correctedSources++
}

fs.writeFileSync(
  DATA_FILE,
  `${JSON.stringify(data, null, 2)}\n`,
)

console.log(
  `Fuentes nacionales corregidas: ${correctedSources}`,
)
console.log(
  `Indicadores auxiliares eliminados: ${removedAuxiliary}`,
)
console.log(
  `Duplicados eliminados: ${removedDuplicates}`,
)

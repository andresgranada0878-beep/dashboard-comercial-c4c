import fs from "node:fs"
import path from "node:path"

const filePath = path.join(
  process.cwd(),
  "data",
  "generated",
  "individual-c4c.json",
)

const data = JSON.parse(
  fs.readFileSync(filePath, "utf8"),
)

const person = "Juana Andrea Moncaleano Sandoval"

const isJuanaDirector = (source) =>
  source.report === "Galagro Nacional" &&
  source.profile === "Director" &&
  source.person === person

const candidates = data.sources.filter(isJuanaDirector)
const otherSources = data.sources.filter(
  (source) => !isJuanaDirector(source),
)

function sourceScore(source) {
  const indicators = Array.isArray(source.indicators)
    ? source.indicators
    : []

  const hectares = indicators.find(
    (indicator) => indicator.id === "hectareas",
  )

  const ids = indicators.map((indicator) => indicator.id)
  const uniqueIds = new Set(ids)

  const invalidHectares = indicators.some(
    (indicator) =>
      indicator.label === "Hectáreas de cultivos impactados" &&
      indicator.quarter?.actual === 1 &&
      indicator.quarter?.target === 90,
  )

  let score = 0

  if (indicators.length === 10) score += 100
  if (uniqueIds.size === indicators.length) score += 40

  if (hectares?.quarter?.target === 100) {
    score += 50
  }

  if (
    hectares?.calculationType ===
    "promedio_cumplimiento_equipo"
  ) {
    score += 50
  }

  if (invalidHectares) score -= 500

  return score
}

const selectedSources = []

console.log(
  `Fuentes de Juana encontradas: ${candidates.length}`,
)

for (const quarter of ["Q1", "Q2"]) {
  const quarterCandidates = candidates
    .filter((source) => source.quarter === quarter)
    .sort((a, b) => sourceScore(b) - sourceScore(a))

  if (!quarterCandidates.length) {
    console.log(`${quarter}: no se encontró fuente`)
    continue
  }

  const selected = quarterCandidates[0]
  const hectares = selected.indicators.find(
    (indicator) => indicator.id === "hectareas",
  )

  selectedSources.push(selected)

  console.log(
    `${quarter}: se conserva ${selected.id} | ` +
    `${selected.indicators.length} indicadores | ` +
    `hectáreas ${hectares?.quarter?.actual} / ` +
    `${hectares?.quarter?.target}`,
  )
}

data.sources = [
  ...otherSources,
  ...selectedSources,
]

fs.writeFileSync(
  filePath,
  JSON.stringify(data, null, 2) + "\n",
  "utf8",
)

console.log(
  `Fuentes finales de Juana: ${selectedSources.length}`,
)
console.log(`Total fuentes: ${data.sources.length}`)

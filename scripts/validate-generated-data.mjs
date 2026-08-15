import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const root = process.cwd()

const generatedPath = path.join(
  root,
  "data",
  "generated",
  "individual-c4c.json",
)

const configPath = path.join(
  root,
  "data",
  "configuracion-c4c.json",
)

const failures = []

const fail = (message) => {
  failures.push(message)
}

if (!fs.existsSync(generatedPath)) {
  throw new Error("No existe data/generated/individual-c4c.json")
}

const data = JSON.parse(
  fs.readFileSync(generatedPath, "utf8"),
)

const config = JSON.parse(
  fs.readFileSync(configPath, "utf8"),
)

// 1. El proceso no puede reportar errores.
if (!Array.isArray(data.errors)) {
  fail("payload.errors no existe o no es un array")
} else if (data.errors.length > 0) {
  fail(
    `El proceso generó ${data.errors.length} error(es): ${data.errors.join(" | ")}`,
  )
}

// 2. Deben existir reportes y fuentes.
if (!Array.isArray(data.reports) || data.reports.length === 0) {
  fail("No se generaron reportes")
}

if (!Array.isArray(data.sources) || data.sources.length === 0) {
  fail("No se generaron fuentes")
}

// 3. Todos los ámbitos configurados deben sobrevivir.
const expectedScopes = new Set(
  config.source_rows.map((row) =>
    [
      String(row[0]),
      String(row[4]),
      String(row[5]),
    ].join("|"),
  ),
)

const generatedScopes = new Set(
  (data.sources ?? []).map((source) =>
    [
      String(source.sourceKey),
      String(source.year),
      String(source.quarter),
    ].join("|"),
  ),
)

for (const scope of expectedScopes) {
  if (!generatedScopes.has(scope)) {
    fail(`Falta el ámbito configurado ${scope}`)
  }
}

// 4. Revisar integridad básica de cada fuente.
const ids = new Set()

for (const source of data.sources ?? []) {
  if (!source.id) {
    fail("Hay una fuente sin ID")
    continue
  }

  if (ids.has(source.id)) {
    fail(`ID de fuente duplicado: ${source.id}`)
  }

  ids.add(source.id)

  if (!source.sourceKey) {
    fail(`${source.id}: falta sourceKey`)
  }

  if (!source.person) {
    fail(`${source.id}: falta persona`)
  }

  if (!source.profile) {
    fail(`${source.id}: falta perfil`)
  }

  if (!/^Q[1-4]$/.test(String(source.quarter))) {
    fail(`${source.id}: trimestre inválido ${source.quarter}`)
  }

  if (
    !Array.isArray(source.indicators) ||
    source.indicators.length === 0
  ) {
    fail(`${source.id}: no tiene indicadores`)
  }
}

// 5. Protección frente a una caída masiva silenciosa.
try {
  const previous = JSON.parse(
    execFileSync(
      "git",
      ["show", "HEAD:data/generated/individual-c4c.json"],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      },
    ),
  )

  const previousCount = previous.sources?.length ?? 0
  const currentCount = data.sources?.length ?? 0

  if (
    previousCount > 0 &&
    currentCount < previousCount * 0.8
  ) {
    fail(
      `Caída anormal de fuentes: ${previousCount} ? ${currentCount}`,
    )
  }
} catch (error) {
  console.log(
    "Aviso: no fue posible comparar contra la versión anterior.",
  )
}

// Resultado.
if (failures.length > 0) {
  console.error("")
  console.error("VALIDACIÓN FALLIDA")
  console.error("===================")

  for (const failure of failures) {
    console.error(`- ${failure}`)
  }

  console.error("")
  console.error(
    "No se debe publicar esta actualización.",
  )

  process.exit(1)
}

console.log("")
console.log("VALIDACIÓN CORRECTA")
console.log("===================")
console.log(`Reportes: ${data.reports.length}`)
console.log(`Fuentes: ${data.sources.length}`)
console.log(`Ámbitos esperados: ${expectedScopes.size}`)
console.log(`Errores del proceso: ${data.errors.length}`)
console.log("")
console.log(
  "Los datos pueden continuar hacia publicación.",
)

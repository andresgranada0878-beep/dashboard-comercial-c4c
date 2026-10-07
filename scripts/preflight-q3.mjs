import fs from "node:fs"
import path from "node:path"

export function inspectSources(manifest, directory, readWorkbook) {
  const failures = []
  for (const source of manifest.sources) {
    const filename = path.join(directory, source.file)
    if (!fs.existsSync(filename)) {
      failures.push(`Falta ${source.file}`)
      continue
    }
    try {
      const workbook = readWorkbook(filename)
      for (const sheet of source.requiredSheets) {
        if (!workbook.Sheets?.[sheet]) failures.push(`${source.file}: falta hoja ${sheet}`)
      }
    } catch (error) {
      failures.push(`${source.file}: ${error.message}`)
    }
  }
  return failures
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const manifest = JSON.parse(fs.readFileSync("config/q3-preparation.json", "utf8"))
  const directory = process.argv[2] ?? "data/fuentes"
  // SheetJS se carga solo cuando hay archivos para inspeccionar.
  const hasFiles = manifest.sources.some(source => fs.existsSync(path.join(directory, source.file)))
  let readWorkbook = () => { throw new Error("No se cargó SheetJS") }
  if (hasFiles) {
    const XLSX = await import("xlsx")
    XLSX.set_fs(fs)
    readWorkbook = filename => XLSX.readFile(filename, { cellFormula: true })
  }
  const failures = inspectSources(manifest, directory, readWorkbook)
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exitCode = 1
  } else {
    console.log("Estructura de archivos Q3 disponible. Falta validar fechas, fórmulas, metas, pesos, topes y resultados contra Excel/Power BI.")
  }
}


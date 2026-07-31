import { utils, type WorkBook } from "xlsx"
import {
  EXPECTED_SHEETS,
  INDICATOR_NAME_TO_KEY,
  REQUIRED_COLUMNS,
} from "@/config/excel-schema"
import { INDICATOR_DEFINITIONS, INDICATOR_MAP } from "@/config/indicators"
import { COMPANY_MAP, resolveCompany } from "@/config/companies"
import {
  canonical,
  cleanText,
  normalizeMonth,
  parseFraction,
  parseNumber,
  sortMonths,
  toId,
} from "@/lib/data-validation"
import type {
  ActivityRecord,
  Advisor,
  AdvisorIndicator,
  CompanyKey,
  DataQualityReport,
  IndicatorKey,
  NarrativeEntry,
  NormalizedDashboardData,
  TerritoryMeta,
} from "@/types/dashboard"

interface Profile {
  empresa: CompanyKey | null
  territorio: string | null
  cargo: string | null
  unidad: string | null
}

function rowsOf(wb: WorkBook, sheet: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheet]
  if (!ws) return []
  return utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
}

function matrixOf(wb: WorkBook, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet]
  if (!ws) return []
  return utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]
}

function indicatorKeyFromName(name: unknown): IndicatorKey | null {
  const c = canonical(name)
  if (!c) return null
  for (const { match, key } of INDICATOR_NAME_TO_KEY) {
    if (c.includes(match)) return key
  }
  return null
}

/** Deriva la unidad de negocio a partir del territorio y la empresa. */
function deriveUnidad(territorio: string | null, empresa: CompanyKey | null): string | null {
  const c = canonical(territorio)
  if (c.includes("galagro")) return "Galagro Antioquia"
  if (c.includes("pyc") || c.includes("perez")) {
    if (c.includes("pecuaria")) return "PyC Pecuaria Antioquia"
    if (c.includes("agricola")) return "PyC Agrícola Antioquia"
    return "PyC Antioquia"
  }
  if (empresa) return COMPANY_MAP[empresa].name
  return null
}

/** Índice de perfiles por nombre normalizado a partir de varias hojas. */
function buildProfileIndex(wb: WorkBook): Map<string, Profile> {
  const index = new Map<string, Profile>()
  const put = (name: unknown, profile: Profile) => {
    const key = canonical(stripTags(name))
    if (!key) return
    const existing = index.get(key)
    if (!existing) {
      index.set(key, profile)
    } else {
      index.set(key, {
        empresa: existing.empresa ?? profile.empresa,
        territorio: existing.territorio ?? profile.territorio,
        cargo: existing.cargo ?? profile.cargo,
        unidad: existing.unidad ?? profile.unidad,
      })
    }
  }

  // Tabla dinam gestion comercial (acceso por índice por columnas duplicadas).
  const td = matrixOf(wb, "Tabla dinam gestion comercial")
  for (let i = 1; i < td.length; i++) {
    const r = td[i]
    if (!r) continue
    const empleado = r[1]
    const empleadoTerr = cleanText(r[0])
    const comercial = r[12]
    const comercialTerr = cleanText(r[13])
    const cargo = cleanText(r[14])
    const empresaTxt = cleanText(r[15])
    if (empleado) {
      const empresa = resolveCompany(empresaTxt, empleadoTerr)
      put(empleado, { empresa, territorio: empleadoTerr, cargo: null, unidad: deriveUnidad(empleadoTerr, empresa) })
    }
    if (comercial) {
      const empresa = resolveCompany(empresaTxt, comercialTerr, cargo)
      put(comercial, { empresa, territorio: comercialTerr, cargo, unidad: deriveUnidad(comercialTerr, empresa) })
    }
  }

  // Leads: Empleado -> Unidad de Negocio + Territorio + Cargo.
  for (const r of rowsOf(wb, "Leads")) {
    const empleado = r["Empleado"] ?? r["Comercial"]
    const territorio = cleanText(r["Territorio"])
    const unidad = cleanText(r["Unidad de Negocio"])
    const cargo = cleanText(r["Cargo"])
    if (empleado) {
      const empresa = resolveCompany(unidad, territorio, cargo)
      put(empleado, { empresa, territorio, cargo, unidad: unidad ?? deriveUnidad(territorio, empresa) })
    }
  }

  // Act Campo: Propietario / Creados por -> Organización de ventas + Territorio.
  for (const r of rowsOf(wb, "Act Campo")) {
    const territorio = cleanText(r["Territorio de ventas"])
    const org = cleanText(r["Organización de ventas"])
    const empresa = resolveCompany(org, territorio)
    const profile: Profile = { empresa, territorio, cargo: null, unidad: deriveUnidad(territorio, empresa) }
    if (r["Propietario"]) put(r["Propietario"], profile)
    if (r["Creados por"]) put(r["Creados por"], profile)
  }

  // Fincas.
  for (const r of rowsOf(wb, "Fincas")) {
    const empleado = r["atr_desc_empleado"]
    const territorio = cleanText(r["des_territorio"])
    const unidad = cleanText(r["Unidad de Negocio"])
    if (empleado) {
      const empresa = resolveCompany(unidad, territorio)
      put(empleado, { empresa, territorio, cargo: null, unidad: unidad ?? deriveUnidad(territorio, empresa) })
    }
  }

  return index
}

/** Quita sufijos entre paréntesis como "(BC)" o "(vacante)" para comparar nombres. */
function stripTags(name: unknown): string {
  return String(name ?? "")
    .replace(/\((?:vacante|vacant)\)/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function resolveProfile(name: string, index: Map<string, Profile>): Profile {
  const key = canonical(stripTags(name))
  const found = index.get(key)
  if (found) return found
  // Coincidencia parcial (primer + último nombre).
  for (const [k, v] of index) {
    if (k.includes(key) || key.includes(k)) return v
  }
  const empresa = resolveCompany(name)
  return { empresa, territorio: null, cargo: null, unidad: empresa ? COMPANY_MAP[empresa].name : null }
}

function buildAdvisors(
  wb: WorkBook,
  index: Map<string, Profile>,
  quality: DataQualityReport,
): Advisor[] {
  const rows = rowsOf(wb, "base director")
  const grouped = new Map<string, Record<string, unknown>[]>()

  for (const r of rows) {
    const comercial = cleanText(r["Comercial"])
    if (!comercial) {
      quality.recordsDiscarded++
      continue
    }
    if (!grouped.has(comercial)) grouped.set(comercial, [])
    grouped.get(comercial)!.push(r)
  }

  const advisors: Advisor[] = []

  for (const [comercial, indicatorRows] of grouped) {
    const profile = resolveProfile(comercial, index)
    const indicators: AdvisorIndicator[] = []

    for (const r of indicatorRows) {
      const key = indicatorKeyFromName(r["Indicador"])
      if (!key) {
        quality.recordsDiscarded++
        continue
      }
      const def = INDICATOR_MAP[key]
      const metaEsperada = parseNumber(r["Meta Esperada"])
      const gestion: Record<string, number | null> = {
        Enero: parseNumber(r["Gestión Real Enero"] ?? r["Gestion Real Enero"]),
        Febrero: parseNumber(r["Gestión Real Febrero"] ?? r["Gestion Real Febrero"]),
        Marzo: parseNumber(r["Gestión Real Marzo"] ?? r["Gestion Real Marzo"]),
      }
      const cumplimientoExcel = parseFraction(r["Cumplimiento"])
      const hasGestion = Object.values(gestion).some((v) => v !== null && v !== 0)
      const quality2 =
        metaEsperada === null || metaEsperada === 0
          ? cumplimientoExcel === null
            ? "sin-info"
            : "warning"
          : "ok"

      indicators.push({
        key,
        label: def.label,
        cumplimientoExcel,
        meta: parseFraction(r["Meta"]),
        peso: parseFraction(r["Peso"]),
        pesoAjustado: parseFraction(r["Peso Ajustado"]),
        metaEsperada,
        gestion,
        quality: quality2,
      })
      quality.recordsProcessed++
      void hasGestion
    }

    // Garantiza los 10 indicadores en orden fijo (rellena faltantes como sin-info).
    const complete: AdvisorIndicator[] = INDICATOR_DEFINITIONS.map((def) => {
      const found = indicators.find((i) => i.key === def.key)
      return (
        found ?? {
          key: def.key,
          label: def.label,
          cumplimientoExcel: null,
          meta: null,
          peso: def.defaultWeight,
          pesoAjustado: null,
          metaEsperada: null,
          gestion: {},
          quality: "sin-info" as const,
        }
      )
    })

    advisors.push({
      id: toId(comercial),
      name: cleanText(stripTags(comercial)) ?? comercial,
      cargo: profile.cargo,
      empresa: profile.empresa,
      unidad: profile.unidad,
      territorio: profile.territorio,
      indicators: complete,
    })
  }

  return advisors
}

function buildTerritories(wb: WorkBook): TerritoryMeta[] {
  const rows = rowsOf(wb, "Territorios")
  const map = new Map<string, TerritoryMeta>()
  for (const r of rows) {
    const territorio = cleanText(r["Territorio de ventas"])
    if (!territorio) continue
    const ciudad = cleanText(r["Ciudad"])
    const total = parseNumber(r["Total"])
    const meta = parseNumber(r["Meta clientes"])
    const responsable = cleanText(r["Encargado"]) ?? cleanText(r["Creados por"])
    const empresa = resolveCompany(territorio)
    if (!map.has(territorio)) {
      map.set(territorio, {
        territorio,
        empresa,
        unidad: deriveUnidad(territorio, empresa),
        responsable,
        ciudades: [],
        totalClientes: 0,
        metaClientes: null,
      })
    }
    const entry = map.get(territorio)!
    if (ciudad && !entry.ciudades.includes(ciudad)) entry.ciudades.push(ciudad)
    if (total !== null) entry.totalClientes = (entry.totalClientes ?? 0) + total
    if (meta !== null) entry.metaClientes = (entry.metaClientes ?? 0) + meta
    if (!entry.responsable && responsable) entry.responsable = responsable
  }
  return [...map.values()].sort((a, b) => a.territorio.localeCompare(b.territorio, "es"))
}

function buildNarratives(wb: WorkBook): NarrativeEntry[] {
  const rows = rowsOf(wb, "Resumen ejecutivo")
  const result: NarrativeEntry[] = []
  for (const r of rows) {
    const nombre = canonical(r["nombre"])
    const mensajeRaw = cleanText(r["Mensaje"])
    if (!mensajeRaw) continue
    const mensaje = mensajeRaw.replace(/^["“]+|["”]+$/g, "").trim()
    let tipo: NarrativeEntry["tipo"]
    if (nombre.includes("fortaleza")) tipo = "fortalezas"
    else if (nombre.includes("oportunidad")) tipo = "oportunidades"
    else tipo = "resumen"

    const valorRaw = r["valor"]
    let min = 0
    if (typeof valorRaw === "string" && valorRaw.includes(">")) {
      min = (parseNumber(valorRaw.replace(">", "")) ?? 0)
    } else {
      min = parseNumber(valorRaw) ?? 0
    }
    result.push({ tipo, min, mensaje })
  }
  return result
}

function buildActivities(wb: WorkBook): ActivityRecord[] {
  const rows = rowsOf(wb, "Act Campo")
  const result: ActivityRecord[] = []
  for (const r of rows) {
    const id = cleanText(r["ID"])
    if (!id) continue
    const territorio = cleanText(r["Territorio de ventas"])
    const org = cleanText(r["Organización de ventas"])
    result.push({
      id,
      estado: cleanText(r["Estado"]),
      asunto: cleanText(r["Asunto"]),
      cliente: cleanText(r["Cliente"]),
      tipoVisita: cleanText(r["Tipo de visita"]),
      propietario: cleanText(r["Propietario"]),
      territorio,
      organizacion: org,
      empresa: resolveCompany(org, territorio),
      ciudad: cleanText(r["Ciudad"]),
      cultivo: cleanText(r["Cultivo"]),
      hectareas: parseNumber(r["Hectáreas"]),
      mes: normalizeMonth(r["mes"]),
    })
  }
  return result
}

function extractMonths(wb: WorkBook): string[] {
  const set = new Set<string>(["Enero", "Febrero", "Marzo"])
  for (const r of rowsOf(wb, "Tabla dinam gestion comercial")) {
    const m = normalizeMonth(r["Mes"])
    if (m) set.add(m)
  }
  return sortMonths([...set])
}

function extractYears(wb: WorkBook): number[] {
  const years = new Set<number>()
  for (const r of rowsOf(wb, "Act Campo")) {
    const raw = r["Creado el"]
    if (raw instanceof Date) years.add(raw.getFullYear())
    else if (typeof raw === "string") {
      const m = raw.match(/(20\d{2})/)
      if (m) years.add(Number(m[1]))
    }
  }
  if (years.size === 0) years.add(2026)
  return [...years].sort((a, b) => b - a)
}

function buildQuality(wb: WorkBook): DataQualityReport {
  const sheetsFound = wb.SheetNames
  const sheetsMissing = EXPECTED_SHEETS.filter(
    (s) => !sheetsFound.some((f) => canonical(f) === canonical(s)),
  )
  const columnsMissing: DataQualityReport["columnsMissing"] = []
  for (const [sheet, cols] of Object.entries(REQUIRED_COLUMNS)) {
    const ws = wb.Sheets[sheet]
    if (!ws) continue
    const header = (utils.sheet_to_json(ws, { header: 1 })[0] as unknown[]) ?? []
    const headerCanon = header.map((h) => canonical(h))
    const missing = cols.filter((c) => !headerCanon.some((h) => h.includes(canonical(c))))
    if (missing.length) columnsMissing.push({ sheet, columns: missing })
  }
  return {
    sheetsFound,
    sheetsMissing: sheetsMissing as string[],
    columnsMissing,
    recordsProcessed: 0,
    recordsDiscarded: 0,
    errors: [],
    warnings: [],
    updatedAt: new Date().toISOString(),
    status: "ok",
  }
}

/** Punto de entrada: transforma un workbook en la estructura normalizada. */
export function normalizeWorkbook(
  wb: WorkBook,
  meta: { fileName: string; source: "default" | "upload" },
): NormalizedDashboardData {
  const quality = buildQuality(wb)
  const profileIndex = buildProfileIndex(wb)
  const advisors = buildAdvisors(wb, profileIndex, quality)
  const territories = buildTerritories(wb)
  const narratives = buildNarratives(wb)
  const activities = buildActivities(wb)
  const months = extractMonths(wb)
  const years = extractYears(wb)

  // Advertencias no críticas.
  if (quality.sheetsMissing.length) {
    quality.warnings.push(`Hojas faltantes: ${quality.sheetsMissing.join(", ")}.`)
  }
  for (const cm of quality.columnsMissing) {
    quality.warnings.push(`Columnas faltantes en "${cm.sheet}": ${cm.columns.join(", ")}.`)
  }
  const advisorsSinEmpresa = advisors.filter((a) => !a.empresa).length
  if (advisorsSinEmpresa > 0) {
    quality.warnings.push(`${advisorsSinEmpresa} comercial(es) sin empresa identificada por reglas de alias.`)
  }

  // Errores críticos.
  if (advisors.length === 0) {
    quality.errors.push("No se encontraron registros en la hoja 'base director'.")
  }
  if (!wb.Sheets["base director"]) {
    quality.errors.push("Falta la hoja principal 'base director'.")
  }

  quality.status = quality.errors.length ? "error" : quality.warnings.length ? "warning" : "ok"

  const companies = [...new Set(advisors.map((a) => a.empresa).filter(Boolean))] as CompanyKey[]
  const quarters = [...new Set(months.map(monthToQuarter))].sort()

  return {
    advisors,
    companies,
    months,
    quarters,
    years,
    territories,
    narratives,
    activities,
    meta: {
      fileName: meta.fileName,
      source: meta.source,
      loadedAt: new Date().toISOString(),
    },
    quality,
  }
}

function monthToQuarter(month: string): string {
  const idx = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ].indexOf(month)
  if (idx < 0) return "Trimestre 1"
  return `Trimestre ${Math.floor(idx / 3) + 1}`
}

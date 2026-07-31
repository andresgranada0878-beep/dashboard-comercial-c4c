import { resolveCompany } from "@/config/companies"
import { INDICATOR_DEFINITIONS, INDICATOR_MAP } from "@/config/indicators"
import { canonical, cleanText, normalizeMonth, parseFraction, parseNumber } from "@/lib/data-validation"
import type { CompanyKey, IndicatorKey, RawExcelWorkbook } from "@/types/dashboard"

export interface IndicatorSourceRecord {
  id: string
  indicatorKey: IndicatorKey
  name: string
  gestionReal: number | null
  meta: number | null
  cumplimientoReal: number | null
  peso: number | null
  empresa: CompanyKey | null
  unidadNegocio: string | null
  territorio: string | null
  asesor: string | null
  cargo: string | null
  anio: number | null
  trimestre: string | null
  mes: string | null
  hojaFuente: string
  calidadDato: "ok" | "sin-info" | "warning"
  advertencias: string[]
  raw: Record<string, unknown>
}

function getStringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (value === null || value === undefined) continue
    const text = cleanText(value)
    if (text) return text
  }
  return null
}

function getNumberValue(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (value === null || value === undefined) continue
    const number = parseNumber(value)
    if (number !== null) return number
  }
  return null
}

function inferCompany(...texts: Array<string | null | undefined>): CompanyKey | null {
  const resolved = resolveCompany(...(texts.filter((value): value is string => Boolean(value))))
  return resolved
}

function inferYear(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const year = Number(text)
  return Number.isFinite(year) ? year : null
}

function getMonthAlias(text: unknown): string | null {
  if (text === null || text === undefined) return null
  return normalizeMonth(text) ?? null
}

function toMetricKey(key: string): string {
  return canonical(key).replace(/[^a-z0-9]+/g, "")
}

function inferYearFromRow(row: Record<string, unknown>): number | null {
  const text = Object.values(row)
    .map((value) => String(value ?? ""))
    .join(" ")
  const match = text.match(/20\d{2}/)
  return match ? Number(match[0]) : 2026
}

function inferQuarterFromMonth(month: string | null): string | null {
  if (!month) return null
  const normalized = canonical(month)
  if (["enero", "febrero", "marzo"].includes(normalized)) return "Trimestre 1"
  if (["abril", "mayo", "junio"].includes(normalized)) return "Trimestre 2"
  if (["julio", "agosto", "septiembre"].includes(normalized)) return "Trimestre 3"
  if (["octubre", "noviembre", "diciembre"].includes(normalized)) return "Trimestre 4"
  return null
}

function buildIndicatorFromBaseDirectorRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const indicatorName = cleanText(getStringValue(row, "indicador", "nombre_indicador", "indicador_1"))
  if (!indicatorName) return []

  const indicatorKey = Object.entries(INDICATOR_MAP).find(([_, def]) => {
    const label = canonical(def.label)
    const short = canonical(def.shortLabel)
    const match = canonical(indicatorName)
    return match === label || match === short || match.includes(label) || match.includes(short)
  })?.[0] as IndicatorKey | undefined

  if (!indicatorKey) return []

  const comercial = getStringValue(row, "comercial", "empleado", "nombre")
  const cargo = getStringValue(row, "cargo", "cargo_comercial")
  const territory = getStringValue(row, "territorio", "territorio_de_ventas")
  const empresa = inferCompany(comercial, territory, sheetName)

  const baseCompliance = parseFraction(getNumberValue(row, "cumplimiento", "cumplimiento_real", "valor"))
  const meta = parseNumber(getNumberValue(row, "meta", "meta_esperada", "meta_1"))
  const peso = parseNumber(getNumberValue(row, "peso_ajustado", "peso"))
  const managementColumns = [
    "gestion_real_enero",
    "gestion_real_febrero",
    "gestion_real_marzo",
    "gestion_real_abril",
    "gestion_real_mayo",
    "gestion_real_junio",
    "gestion_real_julio",
    "gestion_real_agosto",
    "gestion_real_septiembre",
    "gestion_real_octubre",
    "gestion_real_noviembre",
    "gestion_real_diciembre",
  ]

  const results: IndicatorSourceRecord[] = []
  const months = [
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
  ]

  for (let index = 0; index < months.length; index += 1) {
    const month = months[index]
    const monthKey = managementColumns[index]
    const gestionReal = parseNumber(row[monthKey])
    const monthValue = gestionReal ?? parseNumber(row[`gestion_${month.toLowerCase()}`])

    const realCompliance = baseCompliance ?? (monthValue !== null && meta && meta > 0 ? monthValue / meta : null)
    const recognizedCompliance = realCompliance !== null && INDICATOR_MAP[indicatorKey]
      ? Math.min(Math.max(realCompliance, 0), INDICATOR_MAP[indicatorKey].maxRecognized)
      : null

    const warnings: string[] = []
    if (realCompliance === null) warnings.push("Cumplimiento no calculable: faltan valores reales o meta")
    if (peso === null) warnings.push("Peso no disponible en Excel, se usa respaldo")
    const year = inferYearFromRow(row)
    const quarter = inferQuarterFromMonth(month)

    results.push({
      id: `${indicatorKey}-${canonical(comercial || "asesor") || "sin-asesor"}-${month}`,
      indicatorKey,
      name: INDICATOR_MAP[indicatorKey].label,
      gestionReal: monthValue,
      meta,
      cumplimientoReal: realCompliance,
      peso: peso ?? INDICATOR_MAP[indicatorKey].defaultWeight,
      empresa,
      unidadNegocio: getStringValue(row, "unidad_de_negocio", "empresa", "cliente") ?? null,
      territorio: territory,
      asesor: comercial,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: month,
      hojaFuente: sheetName,
      calidadDato: warnings.length > 0 ? "warning" : "ok",
      advertencias: warnings,
      raw: row,
    })
  }

  return results
}

function buildIndicatorFromCommercialTableRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const empresa = inferCompany(getStringValue(row, "empresa"), getStringValue(row, "territorio"), getStringValue(row, "comercial"))
  const mesName = getMonthAlias(getStringValue(row, "mes", "mes_1"))
  const trimestreValue = getStringValue(row, "trimestre", "periodo")
  const territorio = getStringValue(row, "territorio", "territorio_1")
  const asesor = getStringValue(row, "comercial", "empleado")
  const cargo = getStringValue(row, "cargo", "cargo_1")
  const unit = getStringValue(row, "unidad_de_negocio", "empresa")

  const metricDefinitions: Array<{
    key: IndicatorKey
    real: string
    target: string
    weight?: string
    override?: string
  }> = [
    { key: "ejecucionVisitas", real: "ejec_visitas", target: "meta_cobertura_y_visitas", weight: "peso" },
    { key: "coberturaClientes", real: "cobertura_clientes", target: "meta_cobertura_y_visitas", weight: "peso" },
    { key: "nuevosClientes", real: "ejec_clientes_nuevos", target: "meta_clientes_recuperar", weight: "peso" },
  ]

  const results: IndicatorSourceRecord[] = []
  const year = inferYearFromRow(row)
  for (const def of metricDefinitions) {
    const gestionReal = parseNumber(row[def.real])
    const meta = parseNumber(row[def.target])
    const cumplimientoReal = getNumberValue(row, def.real.replace(/_/g, " "), def.real) ??
      ((gestionReal !== null && meta && meta > 0) ? gestionReal / meta : null)

    const peso = parseNumber(row[def.weight ?? "peso"]) ?? INDICATOR_MAP[def.key].defaultWeight
    const recognized = cumplimientoReal !== null ? Math.min(Math.max(cumplimientoReal, 0), INDICATOR_MAP[def.key].maxRecognized) : null
    const quarter = inferQuarterFromMonth(mesName) ?? (trimestreValue ? trimestreValue : null)

    results.push({
      id: `${def.key}-${canonical(asesor || territorio || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: def.key,
      name: INDICATOR_MAP[def.key].label,
      gestionReal,
      meta,
      cumplimientoReal,
      peso,
      empresa,
      unidadNegocio: unit,
      territorio,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: cumplimientoReal === null || meta === null ? "warning" : "ok",
      advertencias: [
        ...(cumplimientoReal === null ? ["No se pudo calcular cumplimiento real a partir del Excel"] : []),
        ...(meta === null ? ["Meta faltante"] : []),
      ],
      raw: row,
    })

    if (recognized !== null) {
      // no-op: placeholder to retain type semantics
    }
  }

  return results
}

function buildIndicatorFromLeadsRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const territory = getStringValue(row, "territorio", "territorio_1")
  const asesor = getStringValue(row, "comercial", "empleado")
  const cargo = getStringValue(row, "cargo", "cargo_1")
  const unit = getStringValue(row, "unidad_de_negocio", "unidad")
  const empresa = inferCompany(unit, territory, asesor)
  const mesName = getMonthAlias(getStringValue(row, "mes"))
  const trimestreValue = getStringValue(row, "trimestre")

  const leadsMeta = parseNumber(getNumberValue(row, "meta_leads", "meta leads", "meta"))
  const leads = parseNumber(getNumberValue(row, "leads_calificados", "calificados", "leads calificados"))
  const leadsATiempo = parseNumber(getNumberValue(row, "a_tiempo", "calificados_a_tiempo", "tiempo"))

  const definitions = [
    { key: "leadsCalificados" as IndicatorKey, gestion: leads, meta: leadsMeta, complianceSource: leads, complianceName: "Leads calificados" },
    { key: "leadsCalificadosATiempo" as IndicatorKey, gestion: leadsATiempo, meta: leadsMeta, complianceSource: leadsATiempo, complianceName: "Leads a tiempo" },
  ]

  return definitions.map((def) => {
    const compliance = def.complianceSource !== null && def.meta && def.meta > 0 ? def.complianceSource / def.meta : parseFraction(row[def.complianceName.toLowerCase().replace(/\s+/g, "_")])
    const weight = INDICATOR_MAP[def.key].defaultWeight
    const year = inferYearFromRow(row)
    const quarter = inferQuarterFromMonth(mesName) ?? (trimestreValue ? trimestreValue : null)
    return {
      id: `${def.key}-${canonical(asesor || territory || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: def.key,
      name: INDICATOR_MAP[def.key].label,
      gestionReal: def.gestion,
      meta: def.meta,
      cumplimientoReal: compliance,
      peso: weight,
      empresa,
      unidadNegocio: unit,
      territorio: territory,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: compliance === null || !def.meta ? "warning" : "ok",
      advertencias: compliance === null || !def.meta ? ["Leads sin meta o sin cumplimiento válido"] : [],
      raw: row,
    }
  })
}

function buildIndicatorFromTechnicalSheetRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const territory = getStringValue(row, "territorio", "des_territorio")
  const asesor = getStringValue(row, "empleado", "atr_desc_empleado", "comercial")
  const cargo = getStringValue(row, "cargo", "cargo_1")
  const unit = getStringValue(row, "unidad_de_negocio", "empresa")
  const empresa = inferCompany(unit, territory, asesor)
  const mesName = getMonthAlias(getStringValue(row, "mes"))

  const recommendations = parseNumber(getNumberValue(row, "valor_recomendaciones", "recomendaciones", "valor_recomendacion"))
  const recommendationBudget = parseNumber(getNumberValue(row, "ppto", "presupuesto", "meta_recomendaciones"))
  const referenceMeta = parseNumber(getNumberValue(row, "meta_referencias", "meta referencias", "meta_referencias_recomendadas"))
  const referencesRecommended = parseNumber(getNumberValue(row, "referencias_recomendadas", "ref_cantidad", "referencias"))

  const results: IndicatorSourceRecord[] = []

  const year = inferYearFromRow(row)
  const quarter = inferQuarterFromMonth(mesName)

  if (recommendations !== null || recommendationBudget !== null) {
    const compliance = recommendations !== null && recommendationBudget && recommendationBudget > 0 ? recommendations / recommendationBudget : null
    results.push({
      id: `recomendaciones-${canonical(asesor || territory || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: "recomendaciones",
      name: INDICATOR_MAP.recomendaciones.label,
      gestionReal: recommendations,
      meta: recommendationBudget,
      cumplimientoReal: compliance,
      peso: INDICATOR_MAP.recomendaciones.defaultWeight,
      empresa,
      unidadNegocio: unit,
      territorio: territory,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: compliance === null || recommendationBudget === null ? "warning" : "ok",
      advertencias: compliance === null ? ["No hubo presupuesto o valor de recomendación válido"] : [],
      raw: row,
    })
  }

  if (referencesRecommended !== null || referenceMeta !== null) {
    const compliance = referencesRecommended !== null && referenceMeta && referenceMeta > 0 ? referencesRecommended / referenceMeta : null
    results.push({
      id: `referencias-${canonical(asesor || territory || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: "referencias",
      name: INDICATOR_MAP.referencias.label,
      gestionReal: referencesRecommended,
      meta: referenceMeta,
      cumplimientoReal: compliance,
      peso: INDICATOR_MAP.referencias.defaultWeight,
      empresa,
      unidadNegocio: unit,
      territorio: territory,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: compliance === null || referenceMeta === null ? "warning" : "ok",
      advertencias: compliance === null ? ["Meta o referencia recomendada no calculable"] : [],
      raw: row,
    })
  }

  return results
}

function buildIndicatorFromFincasRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const unit = getStringValue(row, "unidad_de_negocio", "empresa")
  const territory = getStringValue(row, "des_territorio", "territorio")
  const asesor = getStringValue(row, "atr_desc_empleado", "empleado", "comercial")
  const cargo = getStringValue(row, "cargo", "cargo_1")
  const empresa = inferCompany(unit, territory, asesor)
  const mesName = getMonthAlias(getStringValue(row, "mes"))
  const hectares = parseNumber(getNumberValue(row, "hectareas", "hectareas_impactadas", "valor_hectareas"))
  const crops = parseNumber(getNumberValue(row, "cultivos", "cantidad_cultivos", "suma_de_cultivos"))
  const hectareTarget = parseNumber(getNumberValue(row, "meta_hectareas", "suma_de_meta_hectareas"))
  const cropTarget = parseNumber(getNumberValue(row, "meta_cultivos", "suma_de_cultivos_meta"))

  const results: IndicatorSourceRecord[] = []

  const year = inferYearFromRow(row)
  const quarter = inferQuarterFromMonth(mesName)

  if (hectares !== null || hectareTarget !== null) {
    const compliance = hectares !== null && hectareTarget && hectareTarget > 0 ? hectares / hectareTarget : null
    results.push({
      id: `hectareasCultivos-${canonical(asesor || territory || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: "hectareasCultivos",
      name: INDICATOR_MAP.hectareasCultivos.label,
      gestionReal: hectares,
      meta: hectareTarget,
      cumplimientoReal: compliance,
      peso: INDICATOR_MAP.hectareasCultivos.defaultWeight,
      empresa,
      unidadNegocio: unit,
      territorio: territory,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: compliance === null || hectareTarget === null ? "warning" : "ok",
      advertencias: compliance === null ? ["No se pudo relacionar hectáreas reales con la meta"] : [],
      raw: row,
    })
  }

  if (crops !== null || cropTarget !== null) {
    const compliance = crops !== null && cropTarget && cropTarget > 0 ? crops / cropTarget : null
    results.push({
      id: `cultivosImpactados-${canonical(asesor || territory || "sin-asesor")}-${mesName ?? "sin-mes"}`,
      indicatorKey: "cultivosImpactados",
      name: INDICATOR_MAP.cultivosImpactados.label,
      gestionReal: crops,
      meta: cropTarget,
      cumplimientoReal: compliance,
      peso: INDICATOR_MAP.cultivosImpactados.defaultWeight,
      empresa,
      unidadNegocio: unit,
      territorio: territory,
      asesor,
      cargo,
      anio: year,
      trimestre: quarter,
      mes: mesName,
      hojaFuente: sheetName,
      calidadDato: compliance === null || cropTarget === null ? "warning" : "ok",
      advertencias: compliance === null ? ["No se pudo relacionar cultivos reales con la meta"] : [],
      raw: row,
    })
  }

  return results
}

function buildIndicatorFromFieldActivitiesRow(row: Record<string, unknown>, sheetName: string): IndicatorSourceRecord[] {
  const territorio = getStringValue(row, "territorio_de_ventas", "territorio")
  const asesor = getStringValue(row, "propietario", "creados_por", "empleado")
  const cargo = getStringValue(row, "cargo", "cargo_1")
  const empresa = inferCompany(getStringValue(row, "organizacion_de_ventas"), territorio, asesor)
  const mesName = getMonthAlias(getStringValue(row, "mes", "mes_1"))
  const completed = getStringValue(row, "estado")
  const state = canonical(completed)
  const typeVisit = getStringValue(row, "tipo_de_visita", "tipo de visita")
  const hectareValue = parseNumber(getNumberValue(row, "hectareas"))
  const metaActivities = parseNumber(getNumberValue(row, "meta_actividades", "meta actividades"))

  const count = state === "completado" || typeVisit ? 1 : 0
  const compliance = count > 0 && metaActivities && metaActivities > 0 ? count / metaActivities : null
  const year = inferYearFromRow(row)
  const quarter = inferQuarterFromMonth(mesName)

  return [{
    id: `impactoClientes-${canonical(asesor || territorio || "sin-asesor")}-${mesName ?? "sin-mes"}`,
    indicatorKey: "impactoClientes",
    name: INDICATOR_MAP.impactoClientes.label,
    gestionReal: count,
    meta: metaActivities,
    cumplimientoReal: compliance,
    peso: INDICATOR_MAP.impactoClientes.defaultWeight,
    empresa,
    unidadNegocio: getStringValue(row, "organizacion_de_ventas", "empresa", "unidad_de_negocio"),
    territorio,
    asesor,
    cargo,
    anio: year,
    trimestre: quarter,
    mes: mesName,
    hojaFuente: sheetName,
    calidadDato: compliance === null || metaActivities === null ? "warning" : "ok",
    advertencias: compliance === null ? ["Actividad de campo sin meta o sin volumen suficiente"] : [],
    raw: row,
  }]
}

export function extractIndicatorRecords(rawWorkbook: RawExcelWorkbook): IndicatorSourceRecord[] {
  const extracted: IndicatorSourceRecord[] = []

  for (const sheet of rawWorkbook.sheets) {
    const sheetName = canonical(sheet.name)
    for (const row of sheet.rows) {
      const normalized = row.normalized
      if (sheetName === canonical("base director")) {
        extracted.push(...buildIndicatorFromBaseDirectorRow(normalized, sheet.name))
      }

      if (sheetName === canonical("tabla dinam gestion comercial")) {
        extracted.push(...buildIndicatorFromCommercialTableRow(normalized, sheet.name))
      }

      if (sheetName === canonical("leads")) {
        extracted.push(...buildIndicatorFromLeadsRow(normalized, sheet.name))
      }

      if (sheetName === canonical("tecnico")) {
        extracted.push(...buildIndicatorFromTechnicalSheetRow(normalized, sheet.name))
      }

      if (sheetName === canonical("fincas")) {
        extracted.push(...buildIndicatorFromFincasRow(normalized, sheet.name))
      }

      if (sheetName === canonical("act campo")) {
        extracted.push(...buildIndicatorFromFieldActivitiesRow(normalized, sheet.name))
      }
    }
  }

  return extracted.filter((record) => record.indicatorKey && record.name)
}

export function readIndicatorRecordsFromWorkbook(): Promise<IndicatorSourceRecord[]> {
  return import("@/lib/excel-loader").then(async ({ readDefaultExcelWorkbook }) => {
    const workbook = await readDefaultExcelWorkbook()
    return extractIndicatorRecords(workbook)
  })
}

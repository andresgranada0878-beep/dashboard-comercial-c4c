import type { AgricolaReports } from "./engine.mjs"
import type { StoredLoad } from "./store"
import { STATUS_LABELS } from "./pdf-pages"

const KIND_LABELS = { individual: "Individual", territorio: "Territorio", direccion: "Dirección" } as const
const BLOCK_LABELS: Record<string, string> = {
  commercial: "Gestión comercial", promoters: "Gestión de promotores", technical: "Técnico",
  leads: "Leads", farms: "Fincas", activities: "Actividades de campo",
}

export async function downloadTraceWorkbook(reports: AgricolaReports, load: StoredLoad) {
  const XLSX = await import("xlsx")
  const state = (value: boolean) => (value ? "Completo" : "Parcial / incompleto")
  const results = reports.entities.flatMap((entity) => reports.periods.map((period) => {
    const summary = entity.results[period]
    return {
      "Tipo de informe": KIND_LABELS[entity.kind], Nombre: entity.name, Rol: entity.profile, Territorios: entity.territoryLabel,
      Posición: entity.status, Periodo: period, Resultado: summary.result, "Peso evaluado": summary.evaluatedWeight,
      "Peso total": summary.totalWeight, Estado: state(summary.complete), "Indicadores sin dato": summary.missing.join(", "),
      "Estado del informe": entity.reportState, "Motivos de borrador": entity.draftReasons.join(". "),
    }
  }))
  const trace = reports.entities.flatMap((entity) => entity.indicators.flatMap((indicator) => reports.periods.map((period) => {
    const value = indicator.periods[period]
    return {
      "Tipo de informe": KIND_LABELS[entity.kind], Nombre: entity.name, Rol: entity.profile, Territorios: entity.territoryLabel,
      Periodo: period, Indicador: indicator.label, "Gestión real": value.actual, Meta: value.target,
      "Cumplimiento sin tope": value.rawCompliance, "Cumplimiento reconocido": value.recognizedCompliance,
      Peso: indicator.weight, Tope: indicator.cap, Aporte: value.contribution, Estado: STATUS_LABELS[value.status],
      Fuente: indicator.source, Alcance: indicator.scope, Fórmula: indicator.formula,
      Observaciones: [...indicator.notes, ...value.notes].join(" "),
      "Reglas pendientes": reports.pendingRules.filter((rule) => indicator.pending.includes(rule.id)).map((rule) => rule.title).join(", "),
    }
  })))
  const pending = reports.pendingRules.map((rule) => ({ Regla: rule.title, Estado: "Pendiente de validación", Detalle: rule.detail }))
  const observations = reports.observations.map((text) => ({ Observación: text }))
  const reconciliation = Object.entries(load.blocks).map(([id, block]) => ({
    Bloque: BLOCK_LABELS[id] ?? id, Archivo: block.fileName ?? "Pegado", Leídos: block.summary.read, Válidos: block.summary.selected,
    Excluidos: Object.entries(block.summary.excludedByReason).map(([reason, count]) => `${reason}: ${count}`).join(" · "),
    Meses: Object.entries(block.summary.months).map(([month, count]) => `${month}: ${count}`).join(" · "),
    "Por tipo": block.summary.byType ? Object.entries(block.summary.byType).map(([type, count]) => `${type}: ${count}`).join(" · ") : "",
    Vacíos: Object.entries(block.summary.blanks).map(([field, count]) => `${field}: ${count}`).join(" · "),
    Advertencias: block.warnings.join(" "),
  }))

  const workbook = XLSX.utils.book_new()
  const add = (rows: Record<string, unknown>[], name: string) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Sin registros" }]), name)
  add(results, "Resultados")
  add(trace, "Trazabilidad")
  add(pending, "Reglas pendientes")
  add(observations, "Observaciones")
  add(reconciliation, "Conciliación")
  XLSX.writeFile(workbook, `trazabilidad-agricola-antioquia-${reports.quarter.toLowerCase()}-${reports.year}-borrador.xlsx`)
}

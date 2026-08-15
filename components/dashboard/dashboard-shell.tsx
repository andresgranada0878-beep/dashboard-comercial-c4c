"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { GeneralSummary } from "@/components/dashboard/general-summary"
import { exportIndividualPdf } from "@/lib/pdf/export-individual-pdf"
import type {
  DashboardView,
  IndividualDashboardPayload,
  IndividualIndicator,
  IndividualSource,
  MonthlyIndicatorValue,
  QuarterIndicatorValue,
} from "@/types/individual-dashboard"

const REPORT_ORDER = ["Agrícola Antioquia", "Galagro Antioquia", "Galagro Nacional"]
const QUARTER_ORDER: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 }

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function percent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "Sin información"
  return `${(value * 100).toFixed(digits)}%`
}

function number(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Sin información"
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value)
}

function dateTime(value: string): string {
  if (!value) return "Sin fecha"
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function performance(value: number | null) {
  if (value === null) return { label: "Sin información", tone: "neutral" }
  if (value < 0.6) return { label: "Requiere mejora", tone: "critical" }
  if (value < 0.75) return { label: "En desarrollo", tone: "warning" }
  if (value < 0.9) return { label: "Destacado", tone: "good" }
  return { label: "Excelente", tone: "excellent" }
}

function toneStyle(tone: string) {
  if (tone === "critical") return { background: "#fef2f2", color: "#b42318", border: "#fecaca" }
  if (tone === "warning") return { background: "#fff7ed", color: "#9a5d00", border: "#fed7aa" }
  if (tone === "good") return { background: "#eff8f1", color: "#2f6b3d", border: "#cce6d2" }
  if (tone === "excellent") return { background: "#e8f5ec", color: "#174f2b", border: "#b7ddc2" }
  return { background: "#f3f4f6", color: "#4b5563", border: "#e5e7eb" }
}

function personSort(a: string, b: string) {
  const aVacant = a.toLocaleLowerCase("es").includes("vacante")
  const bVacant = b.toLocaleLowerCase("es").includes("vacante")
  if (aVacant !== bVacant) return aVacant ? 1 : -1
  return a.localeCompare(b, "es", { sensitivity: "base" })
}

function sourceSort(a: IndividualSource, b: IndividualSource) {
  const report = REPORT_ORDER.indexOf(a.report) - REPORT_ORDER.indexOf(b.report)
  if (report !== 0) return report
  const profile = a.profile.localeCompare(b.profile, "es")
  if (profile !== 0) return profile
  const person = personSort(a.person, b.person)
  if (person !== 0) return person
  if (a.year !== b.year) return a.year - b.year
  return (QUARTER_ORDER[a.quarter] ?? 0) - (QUARTER_ORDER[b.quarter] ?? 0)
}

function latestSource(sources: IndividualSource[]): IndividualSource | null {
  return [...sources].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return (QUARTER_ORDER[b.quarter] ?? 0) - (QUARTER_ORDER[a.quarter] ?? 0)
  })[0] ?? null
}

export function DashboardShell() {
  const [data, setData] = useState<IndividualDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string>("")
  const [view, setView] = useState<DashboardView>("trimestral")
  const [month, setMonth] = useState<string>("")
    const [dashboardMode, setDashboardMode] = useState<"individual" | "resumen">("individual")

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard-data?t=${Date.now()}`, { cache: "no-store" })
      const payload = (await response.json()) as IndividualDashboardPayload
      if (!response.ok) throw new Error(payload.errors?.[0] ?? "No fue posible cargar los datos")
      const sorted = [...payload.sources].sort(sourceSort)
      setData({ ...payload, sources: sorted })
      const current = sorted.find((source) => source.id === selectedSourceId)
      const fallback = current ?? latestSource(sorted)
      setSelectedSourceId(fallback?.id ?? "")
      setMonth(fallback?.months[0] ?? "")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de procesamiento")
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = useMemo(
    () => data?.sources.find((source) => source.id === selectedSourceId) ?? null,
    [data, selectedSourceId],
  )

  const reports = useMemo(() => unique((data?.sources ?? []).map((source) => source.report)).sort(
    (a, b) => REPORT_ORDER.indexOf(a) - REPORT_ORDER.indexOf(b),
  ), [data])

  function chooseSource(candidates: IndividualSource[]) {
    const next = latestSource(candidates)
    if (!next) return
    setSelectedSourceId(next.id)
    setMonth(next.months[0] ?? "")
  }

  function selectReport(report: string) {
    chooseSource((data?.sources ?? []).filter((source) => source.report === report))
  }

  function selectProfile(profile: string) {
    chooseSource((data?.sources ?? []).filter((source) => source.report === selected?.report && source.profile === profile))
  }

  function selectYear(year: number) {
    const candidates = (data?.sources ?? []).filter(
      (source) => source.report === selected?.report && source.profile === selected?.profile && source.year === year,
    )
    const samePerson = candidates.filter((source) => source.person === selected?.person)
    chooseSource(samePerson.length ? samePerson : candidates)
  }

  function selectQuarter(quarter: string) {
    const candidates = (data?.sources ?? []).filter(
      (source) =>
        source.report === selected?.report &&
        source.profile === selected?.profile &&
        source.year === selected?.year &&
        source.quarter === quarter,
    )
    const candidate = candidates.find((source) => source.person === selected?.person) ?? candidates[0]
    if (candidate) {
      setSelectedSourceId(candidate.id)
      setMonth(candidate.months[0] ?? "")
    }
  }

  function selectPerson(person: string) {
    const candidate = (data?.sources ?? []).find(
      (source) =>
        source.report === selected?.report &&
        source.profile === selected?.profile &&
        source.year === selected?.year &&
        source.quarter === selected?.quarter &&
        source.person === person,
    )
    if (candidate) setSelectedSourceId(candidate.id)
  }

  const profileOptions = unique((data?.sources ?? []).filter((source) => source.report === selected?.report).map((source) => source.profile))
  const yearOptions = unique((data?.sources ?? []).filter((source) => source.report === selected?.report && source.profile === selected?.profile).map((source) => source.year)).sort((a, b) => b - a)
  const quarterOptions = unique((data?.sources ?? []).filter((source) => source.report === selected?.report && source.profile === selected?.profile && source.year === selected?.year).map((source) => source.quarter)).sort((a, b) => (QUARTER_ORDER[a] ?? 0) - (QUARTER_ORDER[b] ?? 0))
  const personOptions = unique((data?.sources ?? []).filter((source) => source.report === selected?.report && source.profile === selected?.profile && source.year === selected?.year && source.quarter === selected?.quarter).map((source) => source.person)).sort(personSort)

  const indicatorRows = useMemo(() => {
    if (!selected) return []

    const indicators =
      selected.report === "Galagro Nacional" &&
      selected.profile === "Director"
        ? selected.indicators.filter((indicator) => {
            const isHectares =
              indicator.id === "hectareas" ||
              indicator.label === "Hectáreas de cultivos impactados"

            if (!isHectares) return true

            return (
              indicator.calculationType ===
                "promedio_cumplimiento_equipo" &&
              indicator.quarter?.target === 100
            )
          })
        : selected.indicators

    return indicators.map((indicator) => {
      const metric = view === "trimestral"
        ? indicator.quarter
        : indicator.monthly.find((item) => item.month === month) ?? null

      return { indicator, metric }
    })
  }, [selected, view, month])

  const globalResult = useMemo(() => {
    if (!selected) return null
    if (view === "trimestral") return selected.originalQuarterResult
    const total = indicatorRows.reduce((sum, item) => sum + (item.metric?.contribution ?? 0), 0)
    return Number.isFinite(total) ? total : null
  }, [selected, view, indicatorRows])

  const validIndicators = indicatorRows.filter((item) => item.metric?.recognizedCompliance !== null).length
  const globalPerformance = performance(globalResult)
  const globalTone = toneStyle(globalPerformance.tone)

  if (loading) {
    return <CenteredState title="Cargando información" detail="Preparando los resultados individuales validados." />
  }

  if (error || !data || !selected) {
    return <CenteredState title="No fue posible cargar el tablero" detail={error ?? "No existen fuentes individuales disponibles."} />
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5faf6", color: "#183a2a" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.96)", borderBottom: "1px solid #dfe9e1", backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 1380, margin: "0 auto", padding: "18px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.11em", color: "#4f8a5b", textTransform: "uppercase" }}>Gestión comercial</div>
              <h1 style={{ margin: "4px 0 0", fontSize: 28, lineHeight: 1.15 }}>{dashboardMode === "individual" ? "Indicadores individuales C4C" : "Resumen general C4C"}</h1>
              <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>Agrícola Antioquia · Galagro Antioquia · Galagro Nacional</div>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }} aria-label="Empresas del tablero">
                <div style={{ width: 176, height: 62, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", border: "1px solid #e4ece6", borderRadius: 12, padding: 8 }}>
                  <Image src="/logos/perez-cardona.png" alt="Pérez y Cardona" width={1656} height={644} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ width: 104, height: 62, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", border: "1px solid #e4ece6", borderRadius: 12, padding: 6 }}>
                  <Image src="/logos/galagro.png" alt="Galagro" width={1000} height={700} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <a href="/resumen" style={{ ...secondaryButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Resumen ejecutivo</a>
                <button onClick={() => void loadData()} type="button" style={secondaryButton}>Actualizar datos</button>
                <button
                    type="button"
                    onClick={() =>
                      void exportIndividualPdf({
                        source: selected,
                        view,
                        month,
                        globalResult,
                        rows: indicatorRows,
                        generatedAt: data.generatedAt,
                      })
                    }
                    style={{ ...primaryButton, cursor: "pointer" }}
                  >
                    Descargar PDF
                  </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            {reports.map((report) => {
              const active = selected.report === report
              return (
                <button key={report} type="button" onClick={() => selectReport(report)} style={{
                  border: active ? "1px solid #4f8a5b" : "1px solid #dfe9e1",
                  background: active ? "#eaf5ec" : "#ffffff",
                  color: active ? "#245c3a" : "#52625a",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}>{report}</button>
              )
            })}
          </div>
        </div>
      </header>

      {dashboardMode === "resumen" ? (
        <div style={{ maxWidth: 1380, margin: "0 auto", padding: "22px 24px 48px" }}>
          <GeneralSummary data={data} report={selected.report} />
        </div>
      ) : null}

      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "22px 24px 48px", display: dashboardMode === "individual" ? "block" : "none" }}>
        <section style={panelStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 14 }}>
            <SelectField label="Rol" value={selected.profile} options={profileOptions} onChange={selectProfile} />
            <SelectField label="Colaborador" value={selected.person} options={personOptions} onChange={selectPerson} />
            <SelectField label="Año" value={String(selected.year)} options={yearOptions.map(String)} onChange={(value) => selectYear(Number(value))} />
            <SelectField label="Trimestre" value={selected.quarter} options={quarterOptions} onChange={selectQuarter} />
            <SelectField label="Vista" value={view} options={["trimestral", "mensual"]} labels={{ trimestral: "Trimestral", mensual: "Mensual" }} onChange={(value) => setView(value as DashboardView)} />
            {view === "mensual" ? <SelectField label="Mes" value={month} options={selected.months} onChange={setMonth} /> : null}
          </div>
        </section>

        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#4f8a5b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{selected.report}</div>
              <h2 style={{ margin: "5px 0 0", fontSize: 25 }}>{selected.person}</h2>
              <div style={{ color: "#64748b", marginTop: 5, fontSize: 14 }}>{selected.cargo ?? selected.profile} · {selected.territory ?? "Territorio sin identificar"}</div>
            </div>
            <div style={{ border: `1px solid ${globalTone.border}`, background: globalTone.background, color: globalTone.color, borderRadius: 14, padding: "12px 16px", minWidth: 190 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Resultado {view === "trimestral" ? selected.quarter : month}</div>
              <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4 }}>{percent(globalResult, 2)}</div>
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{globalPerformance.label}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 20 }}>
            <SummaryCard label="Rol" value={selected.profile} />
            <SummaryCard label="Equipo disponible" value={`${personOptions.length} personas/posiciones`} />
            <SummaryCard label="Periodo" value={view === "trimestral" ? `${selected.quarter} · ${selected.months.join(", ")}` : `${month} · ${selected.year}`} />
            <SummaryCard label="Indicadores evaluados" value={`${validIndicators} de ${indicatorRows.length}`} />
            <SummaryCard label="Validación trimestral" value={selected.validationStatus} />
          </div>
        </section>

        {view === "mensual" ? (
          <div style={{ marginTop: 18, border: "1px solid #cfe4d4", background: "#eef8f0", borderRadius: 14, padding: "13px 16px", color: "#275c36", fontSize: 13 }}>
            El resultado mensual se calcula con la gestión del mes y la meta mensual equivalente definida por la misma regla del indicador. La referencia oficial trimestral continúa siendo el resultado guardado en el Excel.
          </div>
        ) : null}

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {indicatorRows.map(({ indicator, metric }) => (
            <IndicatorCard key={indicator.id} indicator={indicator} metric={metric} view={view} />
          ))}
        </section>

        <section style={{ ...panelStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>Control de la fuente</h3>
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 5 }}>La fuente actual son los ocho Excel Q1–Q2. El tablero aplica las fórmulas, metas, pesos y topes individuales ya validados.</div>
            </div>
            <span style={{ alignSelf: "start", border: "1px solid #b7ddc2", background: "#e8f5ec", color: "#174f2b", padding: "7px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>{selected.validationStatus}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
            <Context label="Archivo de validación" value={selected.sourceFile} />
            <Context label="Resultado Excel" value={percent(selected.originalQuarterResult, 4)} />
            <Context label="Resultado recalculado" value={percent(selected.calculatedQuarterResult, 4)} />
            <Context label="Diferencia" value={selected.validationDifference === null ? "No verificable" : `${(selected.validationDifference * 100).toFixed(4)} pp`} />
            <Context label="Última actualización válida" value={dateTime(data.generatedAt)} />
          </div>
          {selected.warning ? <div style={{ marginTop: 12, color: "#9a5d00", fontSize: 13 }}>{selected.warning}</div> : null}
          {data.errors.length ? <div style={{ marginTop: 12, color: "#b42318", fontSize: 13 }}>{data.errors.join(" · ")}</div> : null}
        </section>
      </div>
    </main>
  )
}

function IndicatorCard({ indicator, metric, view }: { indicator: IndividualIndicator; metric: QuarterIndicatorValue | MonthlyIndicatorValue | null; view: DashboardView }) {
  const compliance = metric?.recognizedCompliance ?? null
  const state = performance(compliance)
  const tone = toneStyle(state.tone)
  const progress = compliance === null ? 0 : Math.max(0, Math.min(compliance, 1.5)) / 1.5 * 100

  return (
    <article style={{ background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 17, padding: 18, boxShadow: "0 5px 18px rgba(36,92,58,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ color: "#245c3a", fontSize: 15, lineHeight: 1.25, fontWeight: 850 }}>{indicator.label}</div>
          <div style={{ color: "#7a8b81", fontSize: 11, marginTop: 5 }}>{view === "trimestral" ? "Resultado del trimestre" : "Resultado del mes"}</div>
        </div>
        <span style={{ border: `1px solid ${tone.border}`, background: tone.background, color: tone.color, padding: "6px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{state.label}</span>
      </div>

      <div style={{ marginTop: 17, fontSize: 31, fontWeight: 900, color: "#183a2a" }}>{percent(compliance)}</div>
      <div style={{ marginTop: 11, height: 8, background: "#edf3ee", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: compliance !== null && compliance >= 0.9 ? "#4f8a5b" : compliance !== null && compliance >= 0.6 ? "#8fb89a" : "#bfcfc3", borderRadius: 999 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
        <Metric label="Gestión real" value={number(metric?.actual ?? null)} />
        <Metric label="Meta" value={number(metric?.target ?? null)} />
        <Metric label="Peso" value={percent(indicator.weight, 0)} />
        <Metric label="Aporte" value={percent(metric?.contribution ?? null, 2)} />
        <Metric label="Tope" value={indicator.cap === null ? "Sin tope" : percent(indicator.cap, 0)} />
        <Metric label="Tipo de cálculo" value={calculationLabel(indicator.calculationType)} />
      </div>
      {indicator.criterion ? <details style={{ marginTop: 14, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}><summary style={{ cursor: "pointer", color: "#3f6b4a", fontWeight: 800 }}>Criterio de medición</summary><div style={{ marginTop: 8 }}>{indicator.criterion}</div></details> : null}
    </article>
  )
}

function calculationLabel(value: string) {
  if (value === "ratio_acumulado") return "Acumulado / meta"
  if (value === "promedio_mensual") return "Promedio mensual"
  if (value === "ratio") return "Gestión / meta"
  return value.replaceAll("_", " ")
}

function SelectField({ label, value, options, onChange, labels }: { label: string; value: string; options: string[]; onChange: (value: string) => void; labels?: Record<string, string> }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7, color: "#41554a", fontSize: 12, fontWeight: 800 }}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ width: "100%", border: "1px solid #d6e3d9", background: "#ffffff", borderRadius: 11, color: "#183a2a", padding: "10px 11px", fontSize: 13, outline: "none" }}>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
    </label>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div style={{ border: "1px solid #e3ece5", background: "#fafcfb", borderRadius: 13, padding: 13 }}><div style={{ color: "#718078", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div><div style={{ marginTop: 6, color: "#183a2a", fontSize: 15, fontWeight: 850 }}>{value}</div></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ border: "1px solid #edf2ee", borderRadius: 11, padding: 10, background: "#fafcfb", minWidth: 0 }}><div style={{ fontSize: 10, color: "#7a8b81", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div><div style={{ marginTop: 4, color: "#253d30", fontSize: 13, fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div></div>
}

function Context({ label, value }: { label: string; value: string }) {
  return <div><div style={{ color: "#7a8b81", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div><div style={{ color: "#253d30", fontSize: 13, fontWeight: 750, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div></div>
}

function CenteredState({ title, detail }: { title: string; detail: string }) {
  return <main style={{ minHeight: "100vh", background: "#f5faf6", display: "grid", placeItems: "center", padding: 24 }}><div style={{ maxWidth: 520, width: "100%", background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, padding: 28, textAlign: "center", boxShadow: "0 8px 24px rgba(36,92,58,0.08)" }}><h1 style={{ margin: 0, color: "#183a2a", fontSize: 24 }}>{title}</h1><p style={{ margin: "10px 0 0", color: "#64748b", lineHeight: 1.6 }}>{detail}</p></div></main>
}

const panelStyle: CSSProperties = { background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 17, padding: 18, boxShadow: "0 5px 18px rgba(36,92,58,0.06)" }
const secondaryButton: CSSProperties = { border: "1px solid #4f8a5b", background: "#ffffff", color: "#245c3a", borderRadius: 11, padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }
const primaryButton: CSSProperties = { border: "1px solid #245c3a", background: "#245c3a", color: "#ffffff", borderRadius: 11, padding: "10px 14px", fontSize: 13, fontWeight: 800 }

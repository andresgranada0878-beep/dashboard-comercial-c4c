"use client"

import Image from "next/image"
import Link from "next/link"
import { Fragment, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import config from "@/config/agricola-q3-2026.json"
import { buildAgricolaReports } from "@/lib/agricola-q3/engine.mjs"
import type { AgricolaConfig, AgricolaReports, PeriodStatus, Q3Entity } from "@/lib/agricola-q3/engine.mjs"
import { formatPoints, formatShare, normalizedLabel, PARTIAL_LEVEL, partialDetail, STATUS_LABELS, toPdfPage } from "@/lib/agricola-q3/pdf-pages"
import { readLoad, type StoredLoad } from "@/lib/agricola-q3/store"
import { downloadTraceWorkbook } from "@/lib/agricola-q3/trace-workbook"
import { exportIndividualPdf, exportIndividualPdfBundle } from "@/lib/pdf/export-individual-pdf"
import type { PreparedBlock } from "@/lib/agricola-import.mjs"

type Kind = Q3Entity["kind"]
const KIND_TABS: { kind: Kind; label: string }[] = [
  { kind: "individual", label: "Individual" },
  { kind: "territorio", label: "Por territorio" },
  { kind: "direccion", label: "Dirección" },
]

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value * 100)} %`
}

function number(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value)
}

function performance(value: number | null) {
  if (value === null) return "Sin información"
  if (value < 0.6) return "Requiere mejora"
  if (value < 0.75) return "En desarrollo"
  if (value < 0.9) return "Destacado"
  return "Excelente"
}

const STATUS_COLORS: Record<PeriodStatus, [string, string]> = {
  ok: ["#245c3a", "#eaf5ec"],
  parcial: ["#92400e", "#fef3c7"],
  sin_dato: ["#475569", "#f1f5f9"],
  sin_meta: ["#9f1239", "#ffe4e6"],
  no_aplica: ["#334155", "#e2e8f0"],
}

export default function AgricolaQ3Page() {
  const [load, setLoad] = useState<StoredLoad | null | undefined>(undefined)
  const [kind, setKind] = useState<Kind>("individual")
  const [profile, setProfile] = useState("Todos")
  const [entityId, setEntityId] = useState("")
  const [period, setPeriod] = useState("Q3")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { setLoad(readLoad()) }, [])

  const reports: AgricolaReports | null = useMemo(() => {
    if (!load) return null
    return buildAgricolaReports({ blocks: load.blocks as unknown as Record<string, PreparedBlock>, config: config as unknown as AgricolaConfig })
  }, [load])

  const candidates = useMemo(() => (reports?.entities ?? []).filter((entity) => entity.kind === kind && (kind !== "individual" || profile === "Todos" || entity.profile === profile)), [reports, kind, profile])
  const selected = candidates.find((entity) => entity.id === entityId) ?? candidates[0] ?? null

  if (load === undefined) return <Centered title="Cargando" detail="Leyendo los datos de esta pestaña." />
  if (!load || !reports) {
    return <Centered title="No hay datos cargados en esta pestaña" detail="Los informes se calculan con los exportados que cargues. Por seguridad, los datos no se guardan en el servidor y se borran al cerrar la pestaña.">
      <Link href="/cargar-datos" style={{ ...primaryButton, textDecoration: "none" }}>Ir a cargar datos</Link>
    </Centered>
  }

  const loadedAt = load.savedAt
  const periodLabel = period === reports.quarter ? `${reports.quarter} (${reports.months.join(", ")})` : `${period} ${reports.year}`

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label)
    try { await task() } finally { setBusy(null) }
  }

  const bundle = (target: Kind) => {
    const entities = reports.entities.filter((entity) => entity.kind === target)
    const name = { individual: "individuales", territorio: "territoriales", direccion: "direccion" }[target]
    return run(target, () => exportIndividualPdfBundle(entities.map((entity) => toPdfPage(entity, reports, period, loadedAt)), `informes-${name}-agricola-antioquia-${period}-${reports.year}-borrador`))
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5faf6", color: "#183a2a" }}>
      <header style={{ background: "rgba(255,255,255,0.96)", borderBottom: "1px solid #dfe9e1" }}>
        <div style={{ maxWidth: 1380, margin: "0 auto", padding: "18px 24px", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.11em", color: "#4f8a5b", textTransform: "uppercase" }}>Gestión comercial</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>Agrícola Antioquia · {reports.quarter} {reports.year}</h1>
            <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>Calculado con los datos cargados el {new Date(loadedAt).toLocaleString("es-CO")} · configuración {reports.version}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 150, height: 54, background: "#ffffff", border: "1px solid #e4ece6", borderRadius: 12, padding: 6 }}>
              <Image src="/logos/perez-cardona.png" alt="Pérez y Cardona" width={1656} height={644} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <Link href="/" style={secondaryButton}>Informe individual Q1/Q2</Link>
            <Link href="/cargar-datos" style={secondaryButton}>Cargar datos</Link>
            <form action="/api/auth/logout" method="post" style={{ margin: 0 }}><button type="submit" style={secondaryButton}>Salir</button></form>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "18px 24px 60px" }}>
        {!reports.rulesValidated && <section role="status" style={{ ...panel, background: "#fffbeb", borderColor: "#f59e0b" }}>
          <strong style={{ color: "#92400e" }}>Borrador para revisión — no son resultados finales.</strong>
          <span style={{ color: "#92400e" }}> Hay {reports.pendingRules.length} reglas pendientes de validación. Los indicadores sin dato, sin meta o no aplica no suman y el resultado se muestra con el peso realmente evaluado.</span>
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, color: "#92400e" }}>Ver reglas pendientes</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>{reports.pendingRules.map((rule) => <li key={rule.id} style={{ marginBottom: 6 }}><strong>{rule.title}:</strong> {rule.detail}</li>)}</ul>
          </details>
          {reports.approvedRules.length > 0 && <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, color: "#245c3a" }}>Ver reglas aprobadas aplicadas</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>{reports.approvedRules.map((rule) => <li key={rule.id} style={{ marginBottom: 6 }}><strong>{rule.title}:</strong> {rule.detail}</li>)}</ul>
          </details>}
        </section>}

        <section style={panel}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {KIND_TABS.map((tab) => <button key={tab.kind} type="button" onClick={() => { setKind(tab.kind); setEntityId(""); setExpanded(null) }} style={tabStyle(kind === tab.kind)}>{tab.label}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
            {kind === "individual" && <Select label="Rol" value={profile} options={["Todos", "Comercial", "Promotor"]} onChange={(value) => { setProfile(value); setEntityId("") }} />}
            <Select label={kind === "territorio" ? "Territorio" : "Persona"} value={selected?.id ?? ""} options={candidates.map((entity) => entity.id)}
              labels={Object.fromEntries(candidates.map((entity) => [entity.id, entity.kind === "territorio" ? entity.name : `${entity.name} · ${entity.profile} · ${entity.territoryLabel}`]))} onChange={setEntityId} />
            <Select label="Periodo" value={period} options={reports.periods} labels={{ [reports.quarter]: `Trimestre ${reports.quarter}` }} onChange={setPeriod} />
          </div>
        </section>

        {selected && <EntityView entity={selected} reports={reports} period={period} periodLabel={periodLabel} expanded={expanded} setExpanded={setExpanded} />}

        <section style={panel}>
          <h2 style={h2}>Descargas</h2>
          <p style={{ color: "#52625a", fontSize: 13, marginTop: 4 }}>Los PDF usan el formato del informe individual existente y llevan la marca de borrador, el estado de cada indicador, las observaciones y las reglas pendientes. Periodo: {periodLabel}.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" disabled={!selected || busy !== null} style={primaryButton} onClick={() => selected && run("one", () => exportIndividualPdf(toPdfPage(selected, reports, period, loadedAt)))}>
              {busy === "one" ? "Generando…" : "PDF del informe seleccionado"}
            </button>
            {KIND_TABS.map((tab) => <button key={tab.kind} type="button" disabled={busy !== null} style={secondaryButton} onClick={() => void bundle(tab.kind)}>
              {busy === tab.kind ? "Generando…" : `PDF con todos: ${tab.label.toLowerCase()}`}
            </button>)}
            <button type="button" disabled={busy !== null} style={secondaryButton} onClick={() => run("xlsx", () => downloadTraceWorkbook(reports, load))}>
              {busy === "xlsx" ? "Generando…" : "Excel de trazabilidad"}
            </button>
          </div>
        </section>

        <section style={panel}>
          <h2 style={h2}>Resultados del {kind === "individual" ? "equipo" : kind === "territorio" ? "territorio" : "director"} · {periodLabel}</h2>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={table}>
              <thead><tr>{["Nombre", "Rol", "Territorios", ...reports.periods, "Peso evaluado (periodo)", "Cumplimiento normalizado (periodo)", "Estado"].map((head) => <th key={head} style={th}>{head}</th>)}</tr></thead>
              <tbody>{reports.entities.filter((entity) => entity.kind === kind).map((entity) => <tr key={entity.id} style={{ background: entity.id === selected?.id ? "#eaf5ec" : undefined, cursor: "pointer" }} onClick={() => { if (kind === "individual") setProfile("Todos"); setEntityId(entity.id) }}>
                <td style={td}>{entity.name}{entity.status !== "activo" && <span style={{ color: "#92400e" }}> ({entity.status === "vacante" ? "vacante" : "sin titular"})</span>}</td>
                <td style={td}>{entity.profile}</td>
                <td style={td}>{entity.territoryLabel}</td>
                {reports.periods.map((item) => <td key={item} style={{ ...tdNum, fontWeight: item === period ? 800 : 400 }}>{percent(entity.results[item].result)}{!entity.results[item].complete && entity.results[item].result !== null ? "*" : ""}</td>)}
                <td style={tdNum}>{formatShare(entity.results[period].evaluatedWeight)}</td>
                <td style={tdNum}>{percent(entity.results[period].normalized)}</td>
                <td style={td}>{entity.reportState === "final" ? "Final" : "Borrador"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p style={{ color: "#52625a", fontSize: 12 }}>* PARCIAL: peso evaluado menor a 100 % o datos incompletos en algún indicador. Los periodos muestran el aporte ponderado sobre 100 (sin redistribuir pesos); el cumplimiento normalizado es aporte / peso evaluado. Un resultado parcial no tiene nivel de desempeño.</p>
        </section>

        {reports.observations.length > 0 && <section style={panel}>
          <h2 style={h2}>Observaciones de la carga</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>{reports.observations.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>}
      </div>
    </main>
  )
}

function EntityView({ entity, reports, period, periodLabel, expanded, setExpanded }: { entity: Q3Entity; reports: AgricolaReports; period: string; periodLabel: string; expanded: string | null; setExpanded: (value: string | null) => void }) {
  const summary = entity.results[period]
  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ ...h2, fontSize: 22 }}>{entity.name}</h2>
          <div style={{ color: "#52625a", fontSize: 13 }}>{entity.cargo} · {entity.territoryLabel}</div>
        </div>
        <span style={{ alignSelf: "flex-start", color: "#92400e", background: "#fef3c7", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 800 }}>{entity.reportState === "final" ? "Final" : "Borrador"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
        <Summary label="Periodo" value={periodLabel} />
        <Summary label="Aporte ponderado (sobre 100)" value={formatPoints(summary.result)} />
        <Summary label="Cumplimiento normalizado" value={normalizedLabel(entity, period)} />
        <Summary label="Nivel" value={summary.complete ? performance(summary.result) : `${PARTIAL_LEVEL} (${partialDetail(summary)})`} />
        <Summary label="Indicadores sin dato" value={summary.withoutData.length ? summary.withoutData.join(", ") : "Ninguno"} />
        {summary.withoutTarget.length > 0 && <Summary label="Indicadores sin meta" value={summary.withoutTarget.join(", ")} />}      </div>
      {entity.observations.map((item, index) => <p key={index} style={{ color: "#92400e", fontSize: 13 }}>{item}</p>)}
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={table}>
          <thead><tr>{["Indicador", "Gestión real", "Meta", "Cumplimiento", "Reconocido", "Peso", "Aporte", "Estado", "Origen", ""].map((head, index) => <th key={index} style={th}>{head}</th>)}</tr></thead>
          <tbody>{entity.indicators.map((indicator) => {
            const value = indicator.periods[period]
            const [color, background] = STATUS_COLORS[value.status]
            const open = expanded === indicator.id
            return <Fragment key={indicator.id}>
              <tr>
                <td style={{ ...td, fontWeight: 700 }}>{indicator.label}{indicator.weight === 0 && <span style={{ color: "#64748b", fontWeight: 400 }}> (informativo)</span>}</td>
                <td style={tdNum}>{number(value.actual)}</td>
                <td style={tdNum}>{number(value.target)}</td>
                <td style={tdNum}>{percent(value.rawCompliance)}</td>
                <td style={tdNum}>{percent(value.recognizedCompliance)}{indicator.cap !== null && <span style={{ color: "#64748b", fontSize: 11 }}> tope {percent(indicator.cap, 0)}</span>}</td>
                <td style={tdNum}>{percent(indicator.weight, 0)}</td>
                <td style={tdNum}>{percent(value.contribution, 2)}</td>
                <td style={td}><span style={{ color, background, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>{STATUS_LABELS[value.status]}</span></td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{indicator.attribution}</td>
                <td style={td}><button type="button" style={linkButton} onClick={() => setExpanded(open ? null : indicator.id)}>{open ? "Ocultar" : "Detalle"}</button></td>
              </tr>
              {open && <tr><td colSpan={10} style={{ ...td, background: "#fafcfb", fontSize: 13 }}>
                <div><strong>Criterio:</strong> {indicator.criterion}</div>
                <div><strong>Fórmula aplicada:</strong> {indicator.formula}</div>
                <div><strong>Alcance:</strong> {indicator.scope} (fuente: {indicator.source})</div>
                {[...indicator.notes, ...value.notes].map((note, index) => <div key={index}>• {note}</div>)}
                <div style={{ marginTop: 6 }}><strong>Por mes:</strong> {reports.months.map((month) => `${month}: ${number(indicator.periods[month].actual)} / ${number(indicator.periods[month].target)} (${STATUS_LABELS[indicator.periods[month].status]})`).join(" · ")}</div>
                {indicator.pending.length > 0 && <div style={{ color: "#92400e", marginTop: 6 }}>Pendiente de validación: {reports.pendingRules.filter((rule) => indicator.pending.includes(rule.id)).map((rule) => rule.title).join(", ")}</div>}
              </td></tr>}
            </Fragment>
          })}</tbody>
        </table>
      </div>
    </section>
  )
}

function Select({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 7, color: "#41554a", fontSize: 12, fontWeight: 800 }}>
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} style={{ border: "1px solid #d6e3d9", background: "#ffffff", borderRadius: 11, color: "#183a2a", padding: "10px 11px", fontSize: 13 }}>
      {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
    </select>
  </label>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div style={{ border: "1px solid #e3ece5", background: "#fafcfb", borderRadius: 13, padding: 13 }}><div style={{ color: "#718078", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div><div style={{ marginTop: 6, fontSize: 15, fontWeight: 850 }}>{value}</div></div>
}

function Centered({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5faf6", color: "#183a2a", padding: 24 }}>
    <div style={{ ...panel, maxWidth: 520, textAlign: "center" }}><h1 style={{ fontSize: 22, margin: 0 }}>{title}</h1><p style={{ color: "#52625a" }}>{detail}</p>{children}</div>
  </main>
}

const tabStyle = (active: boolean): CSSProperties => ({ border: active ? "1px solid #4f8a5b" : "1px solid #dfe9e1", background: active ? "#eaf5ec" : "#ffffff", color: active ? "#245c3a" : "#52625a", borderRadius: 12, padding: "9px 14px", fontWeight: 800, cursor: "pointer" })
const panel: CSSProperties = { background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 17, padding: 18, marginTop: 16, boxShadow: "0 5px 18px rgba(36,92,58,0.06)" }
const h2: CSSProperties = { margin: 0, fontSize: 18 }
const secondaryButton: CSSProperties = { border: "1px solid #4f8a5b", background: "#ffffff", color: "#245c3a", borderRadius: 11, padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex" }
const primaryButton: CSSProperties = { border: "1px solid #245c3a", background: "#245c3a", color: "#ffffff", borderRadius: 11, padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "inline-flex" }
const linkButton: CSSProperties = { border: 0, background: "none", color: "#245c3a", fontWeight: 800, cursor: "pointer", textDecoration: "underline", padding: 0 }
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 }
const th: CSSProperties = { textAlign: "left", background: "#245c3a", color: "#ffffff", padding: "8px 10px", whiteSpace: "nowrap" }
const td: CSSProperties = { borderBottom: "1px solid #e3ece5", padding: "8px 10px", verticalAlign: "top" }
const tdNum: CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" }

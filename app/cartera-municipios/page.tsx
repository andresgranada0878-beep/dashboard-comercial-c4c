"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { readWorkbookRows } from "@/lib/agricola-q3/store"
import { parseAccountExport, parseOfficialMunicipalities, buildMunicipalPortfolio } from "@/lib/agricola-q3/municipal-portfolio.mjs"
import type { AccountsSource, MunicipalSource } from "@/lib/agricola-q3/municipal-portfolio.mjs"

const panel: CSSProperties = { background: "white", border: "1px solid #dce8de", borderRadius: 16, padding: 20, marginTop: 18 }
const button: CSSProperties = { border: 0, borderRadius: 10, background: "#245c3a", color: "white", fontWeight: 750, padding: "11px 15px", cursor: "pointer" }
const th: CSSProperties = { textAlign: "left", color: "white", background: "#245c3a", padding: "8px 10px", whiteSpace: "nowrap" }
const td: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e6ece7" }
const nf = (n: number) => n.toLocaleString("es-CO")

export default function CarteraMunicipiosPage() {
  const [accounts, setAccounts] = useState<AccountsSource | null>(null)
  const [municipalities, setMunicipalities] = useState<MunicipalSource | null>(null)
  const [filenames, setFilenames] = useState<{ accounts?: string; municipalities?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const report = useMemo(() => accounts && municipalities ? buildMunicipalPortfolio(accounts, municipalities) : null, [accounts, municipalities])

  async function openFile(kind: "accounts" | "municipalities", file?: File) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const rows = await readWorkbookRows(file, kind === "municipalities" ? "Municipios" : undefined)
      if (kind === "accounts") setAccounts(parseAccountExport(rows))
      else setMunicipalities(parseOfficialMunicipalities(rows))
      setFilenames(current => ({ ...current, [kind]: file.name }))
    } catch (err) {
      setError("No se pudo leer el Excel (" + file.name + "): " + (err instanceof Error ? err.message : "Formato incompatible"))
    } finally {
      setBusy(false)
    }
  }

  async function exportWorkbook() {
    if (!report) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const summary = [
      ["CARTERA MUNICIPAL C4C — CONCILIACIÓN", ""],
      ["Estado", report.summary.complete ? "COMPLETA (pendiente aprobación oficial)" : "PRELIMINAR — NO USAR PARA METAS Q3"],
      ["Clientes en base", report.summary.accounts],
      ["Clientes visitables", report.summary.visitable],
      ["Clientes visitables asignados", report.summary.assignedVisitable],
      ["Clientes visitables pendientes", report.summary.pendingVisitable + report.summary.withoutCityVisitable],
      ["Sin municipio/departamento", report.summary.withoutCityVisitable],
      ["Municipios con promotor y territorio", report.summary.mappedMunicipalities],
      ["Municipios en matriz", report.summary.totalMunicipalities],
      ["Errores de validación", report.issues.length],
      ["Fuente", filenames.accounts ?? ""],
      ["Matriz", filenames.municipalities ?? ""],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.promoters.map(p => ({
      Promotor: p.promoter, Territorio: p.territory, Municipios: p.municipalities, "Clientes totales": p.accounts, "Clientes visitables": p.visitable,
    }))), "Promotores")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.pendingMunicipalities.map(p => ({
      Municipio: p.municipality, Departamento: p.department, "Clientes totales": p.accounts, "Clientes visitables": p.visitable, Motivo: p.reason,
    }))), "Pendientes")
    XLSX.writeFile(wb, "C4C_cartera_por_municipio_conciliacion.xlsx")
  }

  return <main style={{ minHeight: "100vh", background: "#f5faf6", padding: "24px 22px 72px", color: "#183a2a" }}>
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/agricola-q3">← Informes Agrícola Q3</Link>
        <Link href="/cargar-datos">Cargar las seis fuentes Q3</Link>
      </nav>
      <h1 style={{ fontSize: 28, margin: "22px 0 8px" }}>Cartera de clientes por municipio</h1>
      <p style={{ maxWidth: 1000, color: "#516458", lineHeight: 1.6 }}>
        Cruce de la base de clientes de C4C con la distribución de municipios aprobada por el área comercial.
        El campo «Creado por» <strong>no</strong> indica a quién pertenece actualmente la cartera.
        Los clientes sin municipio o sin responsable oficial se reportan como pendientes; no se asignan por inferencia.
        El cálculo ocurre en esta pestaña: ningún registro se sube al servidor.
      </p>
      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>1. Cargar bases</h2>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 9, fontSize: 14, fontWeight: 700, minWidth: 300 }}>
            Base de clientes exportada de C4C
            <input type="file" accept=".xlsx" disabled={busy} onChange={e => void openFile("accounts", e.target.files?.[0])} />
            <span style={{ color: "#55665d", fontWeight: 400 }}>{filenames.accounts ?? "Listadecuentas__ES...xlsx"}</span>
          </label>
          <label style={{ display: "grid", gap: 9, fontSize: 14, fontWeight: 700, minWidth: 300 }}>
            Matriz de municipios — columnas J/K completadas
            <input type="file" accept=".xlsx" disabled={busy} onChange={e => void openFile("municipalities", e.target.files?.[0])} />
            <span style={{ color: "#55665d", fontWeight: 400 }}>{filenames.municipalities ?? "Cruce_clientes_por_municipio...xlsx"}</span>
          </label>
        </div>
        {error && <p role="alert" style={{ color: "#a0122a" }}>{error}</p>}
      </section>
      {report && <>
        <section role="status" style={{ ...panel, background: report.summary.complete && !report.issues.length ? "#eaf5ec" : "#fffbeb" }}>
          <strong>{report.summary.complete && !report.issues.length ? "Cruce completo: pendiente de aprobación de la matriz" : "Cruce preliminar: NO reemplaza las metas ni la cobertura Q3"}</strong>
          <p>{nf(report.summary.assignedVisitable)} visitables asignados · {nf(report.summary.pendingVisitable)} con municipio pendientes · {nf(report.summary.withoutCityVisitable)} sin municipio/departamento.</p>
          <p>{nf(report.summary.mappedMunicipalities)} de {nf(report.summary.totalMunicipalities)} municipios de la matriz tienen promotor y territorio.</p>
          {report.issues.length > 0 && <div role="alert" style={{ color: "#a0122a" }}>
            <strong>{report.issues.length} errores de validación:</strong> {report.issues.slice(0, 5).join(" · ")}
          </div>}
          <button style={button} type="button" onClick={() => void exportWorkbook()}>Descargar conciliación Excel</button>
        </section>
        <section style={panel}>
          <h2>2. Clientes asignados por promotor</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Promotor", "Territorio", "Municipios", "Clientes totales", "Visitables"].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
              <tbody>{report.promoters.map(item => <tr key={item.promoter}><td style={td}>{item.promoter}</td><td style={td}>{item.territory}</td><td style={td}>{nf(item.municipalities)}</td><td style={td}>{nf(item.accounts)}</td><td style={td}>{nf(item.visitable)}</td></tr>)}</tbody>
            </table>
          </div>
          {!report.promoters.length && <p>Aún no hay asignaciones oficiales en las columnas J y K de la matriz.</p>}
        </section>
        <section style={panel}>
          <h2>3. Municipios pendientes</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Municipio", "Departamento", "Clientes", "Visitables", "Motivo"].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
              <tbody>{report.pendingMunicipalities.map((item, i) => <tr key={i}><td style={td}>{item.municipality}</td><td style={td}>{item.department}</td><td style={td}>{nf(item.accounts)}</td><td style={td}>{nf(item.visitable)}</td><td style={td}>{item.reason}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </>}
    </div>
  </main>
}

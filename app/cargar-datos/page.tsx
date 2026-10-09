"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AGRICOLA_BLOCKS, prepareAgricolaBlock } from "@/lib/agricola-import.mjs"

const card = { background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 20, marginTop: 16 }
const input = { border: "1px solid #94a3b8", borderRadius: 6, padding: 8 }

export default function ImportBasesPage() {
  const [year, setYear] = useState(2026)
  const [quarter, setQuarter] = useState("Q3")
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [review, setReview] = useState(false)
  const prepared = useMemo(() => AGRICOLA_BLOCKS.map(block => ({
    ...block, ...prepareAgricolaBlock(block.id, texts[block.id] ?? "", year, quarter),
  })), [texts, year, quarter])
  const ready = prepared.every(block => (texts[block.id] ?? "").trim() && block.issues.length === 0)
  return <main style={{ background: "#f1f5f9", minHeight: "100vh", padding: 28, color: "#0f172a" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link href="/resumen">Volver al dashboard</Link>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 18 }}>Agrícola Antioquia — cargar bases</h1>
      <p>Pega cada exportado con sus encabezados originales. Esta versión prepara los datos para revisión; el cálculo y la descarga de informes finales siguen pendientes.</p>
      <section style={card}>
        <div style={{ display: "flex", gap: 20 }}>
          <label>Año<br /><input style={input} type="number" min={2000} max={2100} value={year} onChange={event => { setYear(Number(event.target.value)); setReview(false) }} /></label>
          <label>Trimestre<br /><select style={input} value={quarter} onChange={event => { setQuarter(event.target.value); setReview(false) }}>
            {["Q1", "Q2", "Q3", "Q4"].map(value => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <p>Comerciales y promotores tienen bloques separados. Leads se pega completo. Actividades se pega una sola vez con todos los canales; se seleccionan únicamente las actividades completadas de Agrícola en el periodo.</p>
      </section>
      {prepared.map(block => <section style={card} key={block.id}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{block.label}</h2>
        <label>Pega la tabla copiada desde Excel
          <textarea aria-label={"Datos de " + block.label} style={{ ...input, width: "100%", height: 150, marginTop: 8 }} value={texts[block.id] ?? ""} onChange={event => { setTexts(current => ({ ...current, [block.id]: event.target.value })); setReview(false) }} />
        </label>
        <p>{block.records.length} registros seleccionados · {block.excluded} excluidos · {block.headers.length} columnas</p>
        {block.id === "technical" && <p>Referencias recomendadas se recibe como proporción. La cantidad se obtiene multiplicando esa proporción por Meta Referencias.</p>}
        {block.warnings.map((warning, index) => <p key={index} style={{ color: "#854d0e" }}>{warning}</p>)}
        {block.issues.length > 0 && <div role="status" style={{ color: "#9f1239" }}>{block.issues.slice(0, 5).map((issue, index) => <p key={index}>{issue}</p>)}{block.issues.length > 5 && <p>Y {block.issues.length - 5} observaciones más.</p>}</div>}
      </section>)}
      <button disabled={!ready} style={{ ...input, marginTop: 20, background: ready ? "#0f766e" : "#64748b", color: "white" }} onClick={() => setReview(true)}>Revisar bases del periodo</button>
      {review && <section style={card} role="status">
        <h2 style={{ fontWeight: 700 }}>Bases seleccionadas para revisión</h2>
        <p>Agrícola Antioquia · {year} · {quarter}</p>
        <table><thead><tr><th>Base</th><th>Registros</th></tr></thead><tbody>{prepared.map(block => <tr key={block.id}><td>{block.label}</td><td>{block.records.length}</td></tr>)}</tbody></table>
        <p>La revisión de columnas no valida las metas ni el cumplimiento de los indicadores.</p>
      </section>}
      <p style={{ marginTop: 16 }}>Los datos permanecen en esta sesión de la pantalla. Al salir o recargar se pierden. No se guardan ni se envían al servidor.</p>
    </div>
  </main>
}

"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { normalizeHeader, parsePastedTable, validatePeriod, QUARTER_MONTHS } from "@/lib/pasted-table.mjs"

const BLOCKS = ["Gestión comercial", "Técnico", "Leads", "Actividades de campo", "Fincas"]
const card = { background: "white", border: "1px solid #cbd5e1", borderRadius: 12, padding: 20, marginTop: 16 }
const input = { border: "1px solid #94a3b8", borderRadius: 6, padding: 8 }

export default function ImportBasesPage() {
  const [unit, setUnit] = useState("Agrícola Antioquia")
  const [year, setYear] = useState(2026)
  const [quarter, setQuarter] = useState("Q3")
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [columns, setColumns] = useState<Record<string, { month: number; year: number }>>({})
  const [review, setReview] = useState(false)
  const tables = useMemo(() => BLOCKS.map(name => ({ name, ...parsePastedTable(texts[name] ?? "") })), [texts])
  const prepared = tables.map(table => {
    const month = table.headers.findIndex(header => normalizeHeader(header) === "mes")
    const yearColumn = table.headers.findIndex(header => normalizeHeader(header) === "ano")
    const mapping = columns[table.name] ?? { month, year: yearColumn }
    return { ...table, mapping, issues: validatePeriod(table, { month: mapping.month, year: mapping.year >= 0 ? mapping.year : undefined }, year, quarter) }
  })
  const ready = prepared.every(table => table.issues.length === 0)
  const change = () => setReview(false)
  return <main style={{ background: "#f1f5f9", minHeight: "100vh", padding: 28, color: "#0f172a" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link href="/resumen">Volver al dashboard</Link>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 18 }}>Cargar bases de indicadores</h1>
      <p>Versión de prueba. Pega los datos de Power BI con la fila de encabezados. Esta pantalla valida las bases; los indicadores todavía no se calculan ni se publican.</p>
      <section style={card}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <label>Unidad<br /><select style={input} value={unit} onChange={event => { setUnit(event.target.value); change() }}>
            {["Agrícola Antioquia", "Galagro Antioquia", "Galagro Nacional"].map(name => <option key={name}>{name}</option>)}
          </select></label>
          <label>Año<br /><input style={input} type="number" min={2000} max={2100} value={year} onChange={event => { setYear(Number(event.target.value)); change() }} /></label>
          <label>Trimestre<br /><select style={input} value={quarter} onChange={event => { setQuarter(event.target.value); change() }}>
            {Object.keys(QUARTER_MONTHS).map(value => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <p style={{ marginTop: 12 }}>{QUARTER_MONTHS[quarter].join(", ")}. Cada base debe corresponder a la unidad seleccionada.</p>
      </section>
      {prepared.map(table => <section style={card} key={table.name}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{table.name}</h2>
        <label>Pega la tabla copiada desde Excel
          <textarea aria-label={`Datos de ${table.name}`} style={{ ...input, width: "100%", height: 150, marginTop: 8 }} value={texts[table.name] ?? ""} onChange={event => { setTexts(current => ({ ...current, [table.name]: event.target.value })); setColumns(current => { const next = { ...current }; delete next[table.name]; return next }); change() }} />
        </label>
        <p>{table.rows.length} registros · {table.headers.length} columnas</p>
        {table.headers.length > 0 && <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "12px 0" }}>
          {(["month", "year"] as const).map(field => <label key={field}>{field === "month" ? "Columna de mes (nombre completo)" : "Columna de año"}
            <select style={{ ...input, display: "block" }} value={table.mapping[field]} onChange={event => { setColumns(current => ({ ...current, [table.name]: { ...table.mapping, [field]: Number(event.target.value) } })); change() }}>
              <option value={-1}>{field === "month" ? "Seleccionar" : "No incluida; periodo indicado manualmente"}</option>
              {table.headers.map((header, index) => <option key={index} value={index}>{header || `Columna ${index + 1}`}</option>)}
            </select>
          </label>)}
        </div>}
        {table.rows.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", fontSize: 12 }}><thead><tr>{table.headers.map((header, index) => <th style={{ textAlign: "left", padding: 6 }} key={index}>{header}</th>)}</tr></thead><tbody>{table.rows.slice(0, 3).map((row, index) => <tr key={index}>{row.map((value, column) => <td style={{ padding: 6, borderTop: "1px solid #e2e8f0" }} key={column}>{value}</td>)}</tr>)}</tbody></table></div>}
        {table.issues.length > 0 && <div role="status" style={{ color: "#9f1239", marginTop: 12 }}>{table.issues.slice(0, 5).map((issue, index) => <p key={index}>{issue}</p>)}{table.issues.length > 5 && <p>Y {table.issues.length - 5} observaciones más.</p>}</div>}
      </section>)}
      <button disabled={!ready} style={{ ...input, marginTop: 20, background: ready ? "#0f766e" : "#64748b", color: "white" }} onClick={() => setReview(true)}>Revisar bases del periodo</button>
      {review && <section style={card} role="status"><h2 style={{ fontWeight: 700 }}>Bases preparadas para revisión</h2><p>{unit} · {year} · {quarter}</p><p>{prepared.reduce((sum, table) => sum + table.rows.length, 0)} registros entre las cinco bases. Falta verificar columnas de indicadores, metas, duplicados y reglas de cálculo.</p></section>}
      <p style={{ marginTop: 16 }}>Los datos permanecen en esta sesión de la pantalla. Al salir o recargar se pierden. No se guardan ni se envían al servidor.</p>
    </div>
  </main>
}

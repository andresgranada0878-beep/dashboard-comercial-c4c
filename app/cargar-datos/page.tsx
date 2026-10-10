"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { AGRICOLA_BLOCKS, prepareAgricolaBlock, prepareAgricolaRows } from "@/lib/agricola-import.mjs"
import type { PreparedBlock } from "@/lib/agricola-import.mjs"
import { clearLoad, readLoad, readWorkbookRows, saveLoad } from "@/lib/agricola-q3/store"
import { prepareVisitTargetsRows } from "@/lib/agricola-q3/visit-targets.mjs"

type BlockInput = { text: string; fileName: string | null; fileRows: unknown[][] | null; fileError: string | null }
const EMPTY: BlockInput = { text: "", fileName: null, fileRows: null, fileError: null }

const HELP: Record<string, string> = {
  commercial: "Tabla de gestión comercial de Power BI (incluye la fila del director).",
  promoters: "Tabla de gestión de promotores. Las posiciones vacantes se conservan tal como vienen.",
  technical: "Tabla técnica por grupo de artículos. «Referencias Recomendadas» es una proporción; la cantidad se obtiene con Meta Referencias × proporción. Si pegas, muestra suficientes decimales o carga el .xlsx.",
  leads: "Tabla de leads completa (no se filtra por cargo). Las personas se buscan en el catálogo armado con comerciales y promotores.",
  farms: "Tabla de fincas por territorio, empleado, cultivo y mes.",
  activities: "Lista de actividades de C4C con todos los canales, tal como se descarga (con las filas iniciales). Se aceptan solo actividades completadas de Día de campo, Evento Especial, Visita Mostrador Especial y Visita Formación del periodo.",
}

export default function ImportBasesPage() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [quarter, setQuarter] = useState("Q3")
  const [inputs, setInputs] = useState<Record<string, BlockInput>>({})
  const [targetsInput, setTargetsInput] = useState<BlockInput>(EMPTY)
  const [stored, setStored] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const load = readLoad()
    if (load) setStored(`${load.quarter} ${load.year}, cargado el ${new Date(load.savedAt).toLocaleString("es-CO")}`)
  }, [])

  const prepared = useMemo(() => AGRICOLA_BLOCKS.map((block) => {
    const input = inputs[block.id] ?? EMPTY
    const result: PreparedBlock = input.fileRows
      ? prepareAgricolaRows(block.id, input.fileRows, year, quarter, { origin: "file" })
      : prepareAgricolaBlock(block.id, input.text, year, quarter)
    const loaded = Boolean(input.fileRows || input.text.trim())
    return { ...block, input, result, loaded }
  }), [inputs, year, quarter])

  const preparedVisitTargets = useMemo(() => targetsInput.fileRows ? prepareVisitTargetsRows(targetsInput.fileRows) : null, [targetsInput.fileRows])
  const ready = prepared.every((block) => block.loaded && block.result.issues.length === 0 && block.result.records.length > 0) && (!preparedVisitTargets || preparedVisitTargets.issues.length === 0)

  function update(id: string, patch: Partial<BlockInput>) {
    setInputs((current) => ({ ...current, [id]: { ...(current[id] ?? EMPTY), ...patch } }))
  }

  async function onVisitTargetsFile(file?: File) {
    if (!file) return
    try {
      const fileRows = await readWorkbookRows(file)
      setTargetsInput({ ...EMPTY, fileRows, fileName: file.name })
    } catch {
      setTargetsInput({ ...EMPTY, fileError: "No se pudo leer el archivo de metas (.xlsx)." })
    }
  }

  async function onFile(id: string, file: File | undefined) {
    if (!file) return
    try {
      update(id, { fileRows: await readWorkbookRows(file), fileName: file.name, fileError: null, text: "" })
    } catch {
      update(id, { fileRows: null, fileName: null, fileError: "No se pudo leer el archivo. Verifica que sea un .xlsx exportado." })
    }
  }

  function calculate() {
    try {
      saveLoad({
        savedAt: new Date().toISOString(), year, quarter,
        blocks: {
          ...Object.fromEntries(prepared.map((block) => [block.id, {
            records: block.result.records, issues: block.result.issues, warnings: block.result.warnings,
            summary: block.result.summary, fileName: block.input.fileName,
          }])),
          ...(preparedVisitTargets ? { visitTargets: { records: preparedVisitTargets.records, issues: preparedVisitTargets.issues,
            warnings: ["Metas de visitas Q3 importadas por promotor; asignación municipal preliminar."],
            summary: { origin: "file", read: preparedVisitTargets.summary.read, selected: preparedVisitTargets.summary.selected,
              excludedByReason: {}, months: {}, blanks: {} }, fileName: targetsInput.fileName,
          } } : {}),
        },
      })
      router.push("/agricola-q3")
    } catch {
      setSaveError("El navegador no permitió guardar los datos de la sesión. Libera espacio o usa otra ventana.")
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5faf6", color: "#183a2a", padding: "24px 24px 60px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/" style={secondaryButton}>Informe individual</Link>
          <Link href="/resumen" style={secondaryButton}>Resumen ejecutivo</Link>
          <Link href="/agricola-q3" style={secondaryButton}>Agrícola Q3</Link>
          <form action="/api/auth/logout" method="post" style={{ margin: 0 }}><button type="submit" style={secondaryButton}>Salir</button></form>
        </nav>
        <div style={{ marginTop: 22, fontSize: 12, fontWeight: 800, letterSpacing: "0.11em", color: "#4f8a5b", textTransform: "uppercase" }}>Gestión comercial</div>
        <h1 style={{ margin: "4px 0 0", fontSize: 28 }}>Agrícola Antioquia — cargar datos</h1>
        <p style={{ color: "#52625a", maxWidth: 860 }}>
          Pega cada exportado tal como sale de Power BI o C4C, con sus encabezados, o carga el archivo .xlsx. No hace falta preparar fórmulas en Excel.
          Al calcular, los datos quedan solo en esta pestaña del navegador: no se envían al servidor ni se guardan en el repositorio, y se borran al cerrar la pestaña.
        </p>
        {stored && <div style={{ ...panel, background: "#eaf5ec" }}>
          Hay datos cargados en esta pestaña ({stored}). <Link href="/agricola-q3" style={{ color: "#245c3a", fontWeight: 800 }}>Ver informes</Link>
          {" · "}<button type="button" onClick={() => { clearLoad(); setStored(null) }} style={linkButton}>Borrar datos cargados</button>
        </div>}

        <section style={panel}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <label style={label}>Año<input style={field} type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
            <label style={label}>Trimestre<select style={field} value={quarter} onChange={(event) => setQuarter(event.target.value)}>
              {["Q1", "Q2", "Q3", "Q4"].map((value) => <option key={value}>{value}</option>)}
            </select></label>
          </div>
          {quarter !== "Q3" && <p style={{ color: "#92400e" }}>Los informes calculados en esta página usan la configuración Agrícola Q3 2026. Q1 y Q2 conservan sus resultados históricos en el informe individual.</p>}
        </section>

        {prepared.map((block) => (
          <section key={block.id} style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 19 }}>{block.label}</h2>
              <StatusPill block={block.result} loaded={block.loaded} />
            </div>
            <p style={{ color: "#52625a", fontSize: 13, margin: "6px 0 12px" }}>{HELP[block.id]}</p>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 1fr)", gap: 14 }}>
              <label style={label}>Pegar tabla copiada desde Excel
                <textarea aria-label={"Datos de " + block.label} disabled={Boolean(block.input.fileRows)} style={{ ...field, height: 120, fontFamily: "monospace", fontSize: 12 }} value={block.input.text}
                  onChange={(event) => update(block.id, { text: event.target.value })} placeholder={block.required.join("\t")} />
              </label>
              <div style={label}>O cargar archivo .xlsx
                <input type="file" accept=".xlsx,.xls" aria-label={"Archivo de " + block.label} onChange={(event) => void onFile(block.id, event.target.files?.[0])} style={{ fontSize: 12 }} />
                {block.input.fileName && <span style={{ fontWeight: 600 }}>{block.input.fileName} <button type="button" style={linkButton} onClick={() => update(block.id, { fileRows: null, fileName: null })}>quitar</button></span>}
                {block.input.fileError && <span style={{ color: "#9f1239" }}>{block.input.fileError}</span>}
              </div>
            </div>
            {block.loaded && <BlockSummary block={block.result} />}
          </section>
        ))}

        <section style={{ ...panel, borderColor: "#245c3a", background: "#f2fbf4" }}>
          <h2 style={{ margin: 0 }}>Meta visitas Q3 por promotor — cartera asignada (opcional)</h2>
          <p style={{ color: "#52625a", fontSize: 13 }}>Importa Excel con columnas «Promotor» y «Meta visitas Q3». Para cada promotor, la cifra es la <strong>meta del trimestre completo</strong> (no se multiplica por tres). Modifica exclusivamente la meta de ejecución de visitas. La cobertura, la gestión real, los comerciales, los territorios y la dirección permanecen intactos. Las plazas sin asignación conservan la meta anterior.</p>
          <input type="file" accept=".xlsx" aria-label="Archivo de metas de visitas Q3 por promotor" onChange={(event) => void onVisitTargetsFile(event.target.files?.[0])} />
          {targetsInput.fileName && <p style={{ fontSize: 13 }}>{targetsInput.fileName} · {preparedVisitTargets?.summary.selected ?? 0} metas válidas. <button type="button" style={linkButton} onClick={() => setTargetsInput(EMPTY)}>Quitar archivo</button></p>}
          {targetsInput.fileError && <p role="alert" style={{ color: "#9f1239" }}>{targetsInput.fileError}</p>}
          {preparedVisitTargets?.issues.map((issue, i) => <p key={i} role="alert" style={{ color: "#9f1239" }}>{issue}</p>)}
        </section>

        <section style={panel}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Conciliación de la carga</h2>
          <p style={{ color: "#52625a", fontSize: 13 }}>Compara estos totales con los exportados antes de calcular. Los registros excluidos se cuentan por motivo.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr>{["Bloque", "Origen", "Leídos", "Válidos", "Excluidos", "Julio", "Agosto", "Septiembre", "Observaciones"].map((head) => <th key={head} style={th}>{head}</th>)}</tr></thead>
              <tbody>{prepared.map((block) => {
                const summary = block.result.summary
                const months = Object.entries(summary.months)
                return <tr key={block.id}>
                  <td style={td}>{block.label}</td>
                  <td style={td}>{block.loaded ? (summary.origin === "file" ? "Archivo" : "Pegado") : "—"}</td>
                  <td style={tdNum}>{block.loaded ? summary.read : "—"}</td>
                  <td style={tdNum}>{block.loaded ? summary.selected : "—"}</td>
                  <td style={td}>{Object.entries(summary.excludedByReason).map(([reason, count]) => `${reason}: ${count}`).join(" · ") || (block.loaded ? "0" : "—")}</td>
                  {(block.loaded ? ["Julio", "Agosto", "Septiembre"].map((month) => months.find(([name]) => name === month)?.[1] ?? 0) : ["—", "—", "—"]).map((value, index) => <td key={index} style={tdNum}>{value}</td>)}
                  <td style={td}>{block.result.issues.length ? `${block.result.issues.length} por corregir` : summary.byType ? Object.entries(summary.byType).map(([type, count]) => `${type}: ${count}`).join(" · ") : ""}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
          {saveError && <p role="alert" style={{ color: "#9f1239" }}>{saveError}</p>}
          <button type="button" disabled={!ready} onClick={calculate} style={{ ...primaryButton, marginTop: 14, opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "not-allowed" }}>
            Calcular y ver informes
          </button>
          {!ready && <p style={{ color: "#52625a", fontSize: 13 }}>Carga los seis bloques y corrige las observaciones en rojo para habilitar el cálculo.</p>}
        </section>
      </div>
    </main>
  )
}

function StatusPill({ block, loaded }: { block: PreparedBlock; loaded: boolean }) {
  const [text, color, background] = !loaded ? ["Sin cargar", "#64748b", "#f1f5f9"]
    : block.issues.length ? ["Requiere corrección", "#9f1239", "#ffe4e6"]
    : ["Listo", "#245c3a", "#eaf5ec"]
  return <span style={{ alignSelf: "flex-start", color, background, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{text}</span>
}

function BlockSummary({ block }: { block: PreparedBlock }) {
  const blanks = Object.entries(block.summary.blanks)
  return <div style={{ marginTop: 12, fontSize: 13 }}>
    <div>{block.summary.read} leídos · {block.summary.selected} válidos · {block.summary.read - block.summary.selected} excluidos</div>
    {blanks.length > 0 && <div style={{ color: "#52625a" }}>Celdas vacías (se conservan como dato ausente): {blanks.map(([name, count]) => `${name} ${count}`).join(" · ")}</div>}
    {block.warnings.map((warning, index) => <div key={index} style={{ color: "#92400e" }}>{warning}</div>)}
    {block.issues.length > 0 && <div role="alert" style={{ color: "#9f1239", marginTop: 6 }}>
      {block.issues.slice(0, 6).map((issue, index) => <div key={index}>{issue}</div>)}
      {block.issues.length > 6 && <div>Y {block.issues.length - 6} observaciones más.</div>}
    </div>}
  </div>
}

const panel: CSSProperties = { background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 17, padding: 18, marginTop: 16, boxShadow: "0 5px 18px rgba(36,92,58,0.06)" }
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 7, color: "#41554a", fontSize: 12, fontWeight: 800 }
const field: CSSProperties = { border: "1px solid #d6e3d9", background: "#ffffff", borderRadius: 11, color: "#183a2a", padding: "9px 11px", fontSize: 13, width: "100%", boxSizing: "border-box" }
const secondaryButton: CSSProperties = { border: "1px solid #4f8a5b", background: "#ffffff", color: "#245c3a", borderRadius: 11, padding: "9px 13px", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex" }
const primaryButton: CSSProperties = { border: "1px solid #245c3a", background: "#245c3a", color: "#ffffff", borderRadius: 11, padding: "11px 16px", fontSize: 14, fontWeight: 800 }
const linkButton: CSSProperties = { border: 0, background: "none", color: "#245c3a", fontWeight: 800, cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "inherit" }
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 }
const th: CSSProperties = { textAlign: "left", background: "#245c3a", color: "#ffffff", padding: "8px 10px", whiteSpace: "nowrap" }
const td: CSSProperties = { borderBottom: "1px solid #e3ece5", padding: "8px 10px", verticalAlign: "top" }
const tdNum: CSSProperties = { ...td, textAlign: "right" }

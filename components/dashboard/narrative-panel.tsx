"use client"

import { useMemo } from "react"
import { CheckCircle2, AlertTriangle, Info } from "lucide-react"
import { useDashboard } from "@/components/dashboard/dashboard-provider"
import type { NarrativeEntry } from "@/types/dashboard"

/** Selecciona el mensaje cuyo umbral es el mayor no superior al valor actual. */
function pickForValue(entries: NarrativeEntry[], value: number | null): string | null {
  if (!entries.length) return null
  if (value === null) return entries[0]?.mensaje ?? null
  const pct = value * 100
  const sorted = [...entries].sort((a, b) => a.min - b.min)
  let chosen: NarrativeEntry | null = null
  for (const e of sorted) {
    const threshold = e.min > 1 ? e.min : e.min * 100
    if (pct >= threshold) chosen = e
  }
  return (chosen ?? sorted[0]).mensaje
}

export function NarrativePanel({ globalValue }: { globalValue: number | null }) {
  const { data } = useDashboard()

  const { resumen, fortalezas, oportunidades } = useMemo(() => {
    const all = data?.narratives ?? []
    return {
      resumen: pickForValue(all.filter((n) => n.tipo === "resumen"), globalValue),
      fortalezas: all.filter((n) => n.tipo === "fortalezas").map((n) => n.mensaje),
      oportunidades: all.filter((n) => n.tipo === "oportunidades").map((n) => n.mensaje),
    }
  }, [data, globalValue])

  if (!resumen && !fortalezas.length && !oportunidades.length) return null

  return (
    <div className="flex flex-col gap-4">
      {resumen && (
        <div className="flex gap-3 rounded-lg border border-border bg-secondary/60 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-primary">Lectura del periodo</h3>
            <p className="mt-1 text-sm leading-relaxed text-card-foreground">{resumen}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {fortalezas.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--green)]" />
              <h3 className="text-sm font-semibold text-foreground">Fortalezas</h3>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {fortalezas.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--green)]" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {oportunidades.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
              <h3 className="text-sm font-semibold text-foreground">Oportunidades de mejora</h3>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {oportunidades.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

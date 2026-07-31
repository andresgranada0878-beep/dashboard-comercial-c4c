"use client"

import { useMemo } from "react"
import { PERFORMANCE_LEVELS, getPerformanceLevel } from "@/config/indicators"
import { formatPercent } from "@/lib/format"
import { levelLabel } from "@/lib/indicator-calculator"

interface GaugeProps {
  /** Valor en fracción (0.87 = 87%). */
  value: number | null
  size?: number
  label?: string
}

const START = -220 // grados
const END = 40
const SPAN = END - START

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, r, startAngle)
  const end = polar(cx, cy, r, endAngle)
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export function Gauge({ value, size = 240, label }: GaugeProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 22
  const stroke = 18

  const clamped = value === null ? 0 : Math.max(0, Math.min(value, 1))
  const level = getPerformanceLevel(value)

  const segments = useMemo(() => {
    // Fondo por rangos de desempeño.
    const bounds = [0, 0.6, 0.75, 0.9, 1]
    const colors = ["#c2413b", "#d97706", "#4f8a5b", "#245c3a"]
    return bounds.slice(0, -1).map((from, i) => ({
      from,
      to: bounds[i + 1],
      color: colors[i],
    }))
  }, [])

  const valueAngle = START + SPAN * clamped
  const pointer = polar(cx, cy, r, valueAngle)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} role="img" aria-label={`Cumplimiento global ${formatPercent(value)}`}>
        {/* pista base */}
        <path
          d={arcPath(cx, cy, r, START, END)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* segmentos por rango */}
        {segments.map((s, i) => (
          <path
            key={i}
            d={arcPath(cx, cy, r, START + SPAN * s.from, START + SPAN * s.to)}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeOpacity={0.22}
          />
        ))}
        {/* progreso */}
        {value !== null && (
          <path
            d={arcPath(cx, cy, r, START, valueAngle)}
            fill="none"
            stroke={level?.hex ?? "#245c3a"}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {/* aguja */}
        {value !== null && (
          <>
            <line
              x1={cx}
              y1={cy}
              x2={pointer.x}
              y2={pointer.y}
              stroke={level?.hex ?? "#245c3a"}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={6} fill={level?.hex ?? "#245c3a"} />
          </>
        )}
        {/* valor */}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" fontSize={size * 0.17} fontWeight={700}>
          {value === null ? "—" : formatPercent(value)}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-muted-foreground" fontSize={size * 0.055}>
          {label ?? "Cumplimiento global"}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {PERFORMANCE_LEVELS.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.hex }} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>
      <p className="mt-1 text-sm font-medium" style={{ color: level?.hex ?? "var(--muted-foreground)" }}>
        {levelLabel(level?.key ?? null)}
      </p>
    </div>
  )
}

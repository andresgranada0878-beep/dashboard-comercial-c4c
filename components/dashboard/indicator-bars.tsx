"use client"

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { getPerformanceLevel, REFERENCE_GOAL } from "@/config/indicators"
import { formatPercent } from "@/lib/format"
import type { IndicatorResult } from "@/types/dashboard"

export function IndicatorBars({ indicators }: { indicators: IndicatorResult[] }) {
  const chartData = indicators.map((i) => ({
    name: i.shortLabel,
    fullName: i.label,
    value: i.cumplimientoReconocido === null ? null : Math.round(i.cumplimientoReconocido * 100),
    incluido: i.incluido,
    color: getPerformanceLevel(i.cumplimientoReconocido)?.hex ?? "#cbd5e1",
  }))

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 44, left: 8, bottom: 8 }}
          barCategoryGap={8}
        >
          <XAxis type="number" domain={[0, 150]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <ReferenceLine
            x={REFERENCE_GOAL * 100}
            stroke="#245c3a"
            strokeDasharray="4 4"
            label={{ value: "Meta 90%", position: "top", fontSize: 10, fill: "#245c3a" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number | null) => (v === null ? "Sin datos" : `${v}%`)}
              style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function IndicatorBarsLegend({ indicators }: { indicators: IndicatorResult[] }) {
  const included = indicators.filter((i) => i.incluido).length
  const excluded = indicators.length - included
  return (
    <p className="text-xs text-muted-foreground">
      {included} indicadores con datos
      {excluded > 0 && ` · ${excluded} sin información (${formatPercent(0)} de aporte)`}
    </p>
  )
}

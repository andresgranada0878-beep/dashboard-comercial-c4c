"use client"

import { Users, MapPin, Building2, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useDashboard, useAggregatedResult } from "@/components/dashboard/dashboard-provider"
import { monthOverMonthVariation, quarterMonths } from "@/lib/indicator-calculator"
import { formatNumber, formatSignedPercent } from "@/lib/format"
import { useMemo } from "react"

export function KpiCards() {
  const { data, filteredAdvisors, filters, selectedMonths } = useDashboard()
  const result = useAggregatedResult()

  const variation = useMemo(() => {
    if (!data) return null
    const qMonths = quarterMonths(filters.trimestre ?? "", data.months)
    const currentMonth = selectedMonths.length === 1 ? selectedMonths[0] : (qMonths.at(-1) ?? null)
    return monthOverMonthVariation(filteredAdvisors, qMonths, currentMonth)
  }, [data, filteredAdvisors, filters.trimestre, selectedMonths])

  const included = result.indicators.filter((i) => i.incluido).length

  const cards = [
    {
      label: "Asesores evaluados",
      value: formatNumber(result.advisorsCount),
      icon: Users,
      hint: `${included} de 10 indicadores con datos`,
    },
    {
      label: "Territorios",
      value: formatNumber(result.territoriesCount),
      icon: MapPin,
      hint: "cubiertos en la selección",
    },
    {
      label: "Unidades de negocio",
      value: formatNumber(result.unidadesCount),
      icon: Building2,
      hint: "en la selección actual",
    },
    {
      label: "Variación mensual",
      value: formatSignedPercent(variation),
      icon: variation === null ? Minus : variation >= 0 ? TrendingUp : TrendingDown,
      hint: "frente al mes anterior",
      tone: variation === null ? "muted" : variation >= 0 ? "positive" : "negative",
    },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-border">
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
              <c.icon
                className={
                  "tone" in c && c.tone === "positive"
                    ? "h-4 w-4 text-[var(--green)]"
                    : "tone" in c && c.tone === "negative"
                      ? "h-4 w-4 text-[var(--critical)]"
                      : "h-4 w-4 text-muted-foreground"
                }
              />
            </div>
            <span
              className={
                "tone" in c && c.tone === "positive"
                  ? "text-2xl font-bold text-[var(--green-dark)]"
                  : "tone" in c && c.tone === "negative"
                    ? "text-2xl font-bold text-[var(--critical)]"
                    : "text-2xl font-bold text-foreground"
              }
            >
              {c.value}
            </span>
            <span className="text-[11px] text-muted-foreground">{c.hint}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

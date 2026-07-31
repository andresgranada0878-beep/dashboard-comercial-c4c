"use client"

import { useMemo } from "react"
import { X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useDashboard } from "@/components/dashboard/dashboard-provider"
import { getCompanyName } from "@/config/companies"
import { PERFORMANCE_LEVELS } from "@/config/indicators"
import { formatMonth } from "@/lib/format"
import type { CompanyKey, PerformanceLevelKey } from "@/types/dashboard"

const ALL = "__all__"

export function FilterBar() {
  const { data, filters, setFilter, resetFilters, activeFilterCount } = useDashboard()

  const options = useMemo(() => {
    if (!data) {
      return { unidades: [], territorios: [], asesores: [], cargos: [] }
    }
    const inCompany = data.advisors.filter(
      (a) => !filters.empresa || a.empresa === filters.empresa,
    )
    const inUnit = inCompany.filter((a) => !filters.unidad || a.unidad === filters.unidad)
    const inTerritory = inUnit.filter(
      (a) => !filters.territorio || a.territorio === filters.territorio,
    )
    const uniq = (arr: (string | null)[]) =>
      Array.from(new Set(arr.filter((v): v is string => !!v))).sort()

    return {
      unidades: uniq(inCompany.map((a) => a.unidad)),
      territorios: uniq(inUnit.map((a) => a.territorio)),
      asesores: inTerritory
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((x, y) => x.name.localeCompare(y.name)),
      cargos: uniq(data.advisors.map((a) => a.cargo)),
    }
  }, [data, filters.empresa, filters.unidad, filters.territorio])

  if (!data) return null

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <FilterSelect
          label="Empresa"
          value={filters.empresa ?? ALL}
          onChange={(v) => setFilter("empresa", v === ALL ? null : (v as CompanyKey))}
          options={[
            { value: ALL, label: "Todas las empresas" },
            ...data.companies.map((c) => ({ value: c, label: getCompanyName(c) })),
          ]}
        />
        <FilterSelect
          label="Unidad"
          value={filters.unidad ?? ALL}
          onChange={(v) => setFilter("unidad", v === ALL ? null : v)}
          options={[
            { value: ALL, label: "Todas las unidades" },
            ...options.unidades.map((u) => ({ value: u, label: u })),
          ]}
        />
        <FilterSelect
          label="Territorio"
          value={filters.territorio ?? ALL}
          onChange={(v) => setFilter("territorio", v === ALL ? null : v)}
          options={[
            { value: ALL, label: "Todos los territorios" },
            ...options.territorios.map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          label="Asesor"
          value={filters.asesor ?? ALL}
          onChange={(v) => setFilter("asesor", v === ALL ? null : v)}
          options={[
            { value: ALL, label: "Todos los asesores" },
            ...options.asesores.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <FilterSelect
          label="Trimestre"
          value={filters.trimestre ?? ALL}
          onChange={(v) => setFilter("trimestre", v === ALL ? null : v)}
          options={data.quarters.map((q) => ({ value: q, label: q }))}
        />
        <FilterSelect
          label="Mes"
          value={filters.mes ?? ALL}
          onChange={(v) => setFilter("mes", v === ALL ? null : v)}
          options={[
            { value: ALL, label: "Trimestre completo" },
            ...data.months.map((m) => ({ value: m, label: formatMonth(m) })),
          ]}
        />
        <FilterSelect
          label="Nivel"
          value={filters.nivel ?? ALL}
          onChange={(v) => setFilter("nivel", v === ALL ? null : (v as PerformanceLevelKey))}
          options={[
            { value: ALL, label: "Todos los niveles" },
            ...PERFORMANCE_LEVELS.map((l) => ({ value: l.key, label: l.label })),
          ]}
        />

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="ml-auto gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[160px] bg-card text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

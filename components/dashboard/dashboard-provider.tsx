"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import useSWR from "swr"
import type {
  DashboardFilters,
  NormalizedDashboardData,
  ReportView,
} from "@/types/dashboard"
import {
  aggregate,
  filterAdvisors,
  latestQuarter,
  resolveSelectedMonths,
} from "@/lib/indicator-calculator"

const EMPTY_FILTERS: DashboardFilters = {
  empresa: null,
  unidad: null,
  territorio: null,
  asesor: null,
  cargo: null,
  anio: null,
  trimestre: null,
  mes: null,
  nivel: null,
}

interface DashboardContextValue {
  data: NormalizedDashboardData | null
  isLoading: boolean
  error: string | null
  filters: DashboardFilters
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void
  resetFilters: () => void
  activeFilterCount: number
  view: ReportView
  setView: (view: ReportView) => void
  selectedMonths: string[]
  quarterMonthCount: number
  filteredAdvisors: NormalizedDashboardData["advisors"]
  refresh: () => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

const fetcher = async (url: string): Promise<NormalizedDashboardData> => {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Error ${res.status} al cargar el informe.`)
  }
  return res.json()
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<NormalizedDashboardData>(
    "/api/report",
    fetcher,
    { revalidateOnFocus: false },
  )

  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS)
  const [view, setView] = useState<ReportView>("resumen-ejecutivo")

  const setFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      // Reinicia filtros dependientes al cambiar un nivel superior.
      if (key === "empresa") {
        next.unidad = null
        next.territorio = null
        next.asesor = null
      }
      if (key === "unidad") {
        next.territorio = null
        next.asesor = null
      }
      if (key === "territorio") {
        next.asesor = null
      }
      if (key === "trimestre") {
        next.mes = null
      }
      return next
    })
  }

  const resetFilters = () => setFilters(EMPTY_FILTERS)

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(
        ([key, value]) => value !== null && key !== "trimestre" && key !== "anio",
      ).length,
    [filters],
  )

  const effectiveFilters = useMemo<DashboardFilters>(() => {
    if (!data) return filters
    const trimestre = filters.trimestre ?? latestQuarter(data)
    return { ...filters, trimestre }
  }, [filters, data])

  const { months, quarterMonthCount } = useMemo(() => {
    if (!data) return { months: [] as string[], quarterMonthCount: 1 }
    const resolved = resolveSelectedMonths(effectiveFilters, data)
    return { months: resolved.months, quarterMonthCount: resolved.quarterMonthCount }
  }, [effectiveFilters, data])

  const filteredAdvisors = useMemo(() => {
    if (!data) return []
    return filterAdvisors(data.advisors, effectiveFilters)
  }, [data, effectiveFilters])

  const value: DashboardContextValue = {
    data: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    filters: effectiveFilters,
    setFilter,
    resetFilters,
    activeFilterCount,
    view,
    setView,
    selectedMonths: months,
    quarterMonthCount,
    filteredAdvisors,
    refresh: () => mutate(),
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard debe usarse dentro de DashboardProvider")
  return ctx
}

/** Hook de conveniencia: resultado agregado para el conjunto filtrado actual. */
export function useAggregatedResult() {
  const { filteredAdvisors, selectedMonths, quarterMonthCount } = useDashboard()
  return useMemo(
    () => aggregate(filteredAdvisors, selectedMonths, quarterMonthCount),
    [filteredAdvisors, selectedMonths, quarterMonthCount],
  )
}

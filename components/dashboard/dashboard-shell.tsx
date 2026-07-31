"use client"

import { useEffect, useMemo, useState } from "react"

const ALL = "Todos"

type DashboardStatus =
  | "cargando"
  | "datos-cargados"
  | "sin-informacion"
  | "archivo-no-encontrado"
  | "error-procesamiento"
  | "informacion-parcial"

interface IndicatorSummaryItem {
  key: string
  label: string
  shortLabel?: string
  defaultWeight?: number
}

interface DashboardApiResponse {
  ok: boolean
  status: DashboardStatus
  message: string
  updatedAt: string
  filesProcessed: string[]
  recordsProcessed: number
  sheetsProcessed: string[]
  warnings: string[]
  errors: string[]
  availableFilters: {
    empresas: string[]
    unidades: string[]
    territorios: string[]
    asesores: string[]
    cargos: string[]
    anios: number[]
    trimestres: string[]
    meses: string[]
  }
  defaultFilters: {
    empresa: string
    unidad: string
    territorio: string
    asesor: string
    cargo: string
    anio: string
    trimestre: string
    mes: string
  }
  indicators: IndicatorSummaryItem[]
  indicadoresSinInformacion: string[]
  summary: {
    cantidadRegistrosPorIndicador: Record<string, number>
    indicadoresCalculados: string[]
    indicadoresSinInformacion: string[]
    errores: string[]
    advertencias: string[]
    resultadoGlobalPrueba: number | null
  }
  globalResult: number | null
  results: Array<{
    id: string
    nombre: string
    gestionReal: number | null
    meta: number | null
    cumplimientoReal: number | null
    cumplimientoReconocido: number | null
    peso: number
    aportePonderado: number | null
    empresa: string | null
    unidadNegocio: string | null
    territorio: string | null
    asesor: string | null
    cargo: string | null
    anio: number | null
    trimestre: string | null
    mes: string | null
    hojaFuente: string
    estadoCalidad: "ok" | "sin-info" | "warning"
    advertencias: string[]
    indicadorKey: string
  }>
  records: Array<{
    indicadorKey: string
    empresa: string | null
    unidadNegocio: string | null
    territorio: string | null
    asesor: string | null
    cargo: string | null
    anio: number | null
    trimestre: string | null
    mes: string | null
    hojaFuente: string
    calidadDato: "ok" | "sin-info" | "warning"
    advertencias: string[]
    name: string
    gestionReal: number | null
    meta: number | null
    cumplimientoReal: number | null
    peso: number | null
  }>
}

function toPercent(value: number | null): string {
  if (value === null) return "Sin información"
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value: number | null): string {
  if (value === null) return "Sin información"
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value)
}

function formatDate(value: string): string {
  if (!value) return "Sin fecha"
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getPerformanceLabel(value: number | null): string {
  if (value === null) return "Sin información"
  if (value < 0.6) return "Requiere mejora"
  if (value < 0.75) return "En desarrollo"
  if (value < 0.9) return "Destacado"
  return "Excelente"
}

const companyOptions = [
  { label: "Pérez y Cardona", value: "perez-cardona" },
  { label: "Galagro", value: "galagro" },
  { label: "Tierragro", value: "tierragro" },
] as const

export function DashboardShell() {
  const [status, setStatus] = useState<DashboardStatus>("cargando")
  const [data, setData] = useState<DashboardApiResponse | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState({
    empresa: ALL,
    unidad: ALL,
    territorio: ALL,
    asesor: ALL,
    cargo: ALL,
    anio: ALL,
    trimestre: ALL,
    mes: ALL,
  })

  const fetchDashboardData = async () => {
    setIsRefreshing(true)
    setStatus("cargando")

    try {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" })
      const payload = (await response.json()) as DashboardApiResponse

      setData(payload)
      setStatus((payload.status as DashboardStatus) ?? "cargando")

      if (payload.defaultFilters) {
        setFilters({
          empresa: payload.defaultFilters.empresa || ALL,
          unidad: payload.defaultFilters.unidad || ALL,
          territorio: payload.defaultFilters.territorio || ALL,
          asesor: payload.defaultFilters.asesor || ALL,
          cargo: payload.defaultFilters.cargo || ALL,
          anio: payload.defaultFilters.anio || ALL,
          trimestre: payload.defaultFilters.trimestre || ALL,
          mes: payload.defaultFilters.mes || ALL,
        })
      }
    } catch (error) {
      setStatus("error-procesamiento")
      setData(null)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchDashboardData()
  }, [])

  const available = data?.availableFilters ?? {
    empresas: [],
    unidades: [],
    territorios: [],
    asesores: [],
    cargos: [],
    anios: [],
    trimestres: [],
    meses: [],
  }

  const empresaOptionsWithFallback = useMemo(
    () => [
      ...companyOptions.map((company) => ({
        label: company.label,
        value: company.value,
      })),
      ...available.empresas
        .filter((empresa) => !companyOptions.some((company) => company.value === empresa))
        .map((empresa) => ({ label: empresa, value: empresa })),
    ],
    [available.empresas],
  )

  const filteredRecords = useMemo(() => {
    if (!data) return []

    return data.records.filter((record) => {
      const empresaOk = filters.empresa === ALL || record.empresa === filters.empresa
      const unidadOk = filters.unidad === ALL || record.unidadNegocio === filters.unidad
      const territorioOk = filters.territorio === ALL || record.territorio === filters.territorio
      const asesorOk = filters.asesor === ALL || record.asesor === filters.asesor
      const cargoOk = filters.cargo === ALL || record.cargo === filters.cargo
      const anioOk = filters.anio === ALL || String(record.anio) === filters.anio
      const trimestreOk = filters.trimestre === ALL || record.trimestre === filters.trimestre
      const mesOk = filters.mes === ALL || record.mes === filters.mes
      return empresaOk && unidadOk && territorioOk && asesorOk && cargoOk && anioOk && trimestreOk && mesOk
    })
  }, [data, filters])

  const filteredResults = useMemo(() => {
    if (!data) return []

    return data.results.filter((item) => {
      const empresaOk = filters.empresa === ALL || item.empresa === filters.empresa
      const unidadOk = filters.unidad === ALL || item.unidadNegocio === filters.unidad
      const territorioOk = filters.territorio === ALL || item.territorio === filters.territorio
      const asesorOk = filters.asesor === ALL || item.asesor === filters.asesor
      const cargoOk = filters.cargo === ALL || item.cargo === filters.cargo
      const anioOk = filters.anio === ALL || String(item.anio) === filters.anio
      const trimestreOk = filters.trimestre === ALL || item.trimestre === filters.trimestre
      const mesOk = filters.mes === ALL || item.mes === filters.mes
      return empresaOk && unidadOk && territorioOk && asesorOk && cargoOk && anioOk && trimestreOk && mesOk
    })
  }, [data, filters])

  const companySummary = useMemo(() => {
    if (!filteredResults.length) return null
    const total = filteredResults.reduce((sum, item) => sum + (item.cumplimientoReconocido ?? 0) * (item.peso ?? 0), 0)
    return total
  }, [filteredResults])

  const globalSummary = data?.globalResult ?? null

  const cards = [
    { title: "Resultado global", value: toPercent(globalSummary) },
    { title: "Resultado de la empresa", value: toPercent(companySummary) },
    { title: "Resultado de la unidad", value: toPercent(filteredResults[0]?.cumplimientoReconocido ?? null) },
    { title: "Resultado del territorio", value: toPercent(filteredResults[1]?.cumplimientoReconocido ?? null) },
    { title: "Resultado del asesor", value: toPercent(filteredResults[2]?.cumplimientoReconocido ?? null) },
  ]

  const indicatorDefinitions = data?.indicators ?? []
  const allIndicators = indicatorDefinitions.map((indicator) => ({
    ...indicator,
    label: indicator.label,
    results: filteredResults.filter((item) => item.indicadorKey === indicator.key),
  }))

  const resetFilters = () => {
    setFilters({
      empresa: ALL,
      unidad: ALL,
      territorio: ALL,
      asesor: ALL,
      cargo: ALL,
      anio: ALL,
      trimestre: data?.defaultFilters?.trimestre || ALL,
      mes: ALL,
    })
  }

  const companySelected = (filters.empresa === ALL ? null : filters.empresa) ?? null
  const companyLabel = companySelected ? companyOptions.find((company) => company.value === companySelected)?.label ?? companySelected : "Todas"
  const hasSelectedCompanyRecords = companySelected ? filteredRecords.some((record) => record.empresa === companySelected) : true

  const statusContent = {
    cargando: { title: "Cargando información", description: "Consultando el archivo Excel y calculando indicadores..." },
    "datos-cargados": { title: "Datos cargados correctamente", description: "La información del Excel ya está disponible en el dashboard." },
    "sin-informacion": { title: "Sin información", description: "No se encontraron registros válidos en el archivo Excel." },
    "archivo-no-encontrado": { title: "Archivo no encontrado", description: "La carpeta data no contiene un archivo Excel válido." },
    "error-procesamiento": { title: "Error de procesamiento", description: "Ocurrió un error al leer o calcular los indicadores del Excel." },
    "informacion-parcial": { title: "Información parcial", description: "Algunos datos se cargaron, pero hay advertencias o archivos incompletos." },
  }[status]

  return (
    <main style={{ background: "#f5faf6", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header style={{ background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "20px 24px", borderBottom: "1px solid #edf3ee" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#245c3a", textTransform: "uppercase" }}>Indicadores C4C</div>
              <div style={{ marginTop: 6, fontSize: "clamp(1.2rem, 2vw, 1.8rem)", fontWeight: 700, color: "#183a2a" }}>Pérez y Cardona S.A.S.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {companyOptions.map((company) => {
                const isActive = filters.empresa === company.value

                return (
                  <button
                    key={company.value}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, empresa: isActive ? ALL : company.value }))}
                    style={{
                      border: "1px solid",
                      borderColor: isActive ? "#245c3a" : "#dfe9e1",
                      background: isActive ? "#245c3a" : "#ffffff",
                      color: isActive ? "#ffffff" : "#245c3a",
                      borderRadius: 999,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {company.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "16px 24px", background: "#f9fcfa" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>Última actualización:</span>
              <span style={{ fontSize: 14, color: "#183a2a", fontWeight: 700 }}>{data ? formatDate(data.updatedAt) : "Cargando..."}</span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void fetchDashboardData()}
                disabled={isRefreshing}
                style={{
                  border: "1px solid #245c3a",
                  background: isRefreshing ? "#dfe9e1" : "#ffffff",
                  color: "#245c3a",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isRefreshing ? "wait" : "pointer",
                }}
              >
                {isRefreshing ? "Actualizando..." : "Actualizar datos"}
              </button>
              <button type="button" disabled style={{
                border: "none",
                background: "#c7d4c9",
                color: "#ffffff",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "not-allowed",
              }}>
                Funcionalidad en construcción
              </button>
            </div>
          </div>
        </header>

        <section style={{ marginTop: 20, background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, padding: 20, boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", color: "#245c3a", textTransform: "uppercase" }}>Estado</div>
              <h2 style={{ margin: 0, color: "#183a2a", fontSize: 24 }}>{statusContent.title}</h2>
            </div>
            {data && (
              <div style={{ color: "#3f6b4a", fontSize: 13, fontWeight: 700 }}>
                {data.filesProcessed.length} archivo(s) • {data.recordsProcessed} registros • {data.sheetsProcessed.length} hoja(s)
              </div>
            )}
          </div>

          <div style={{ color: "#4b5563", marginBottom: 12 }}>{statusContent.description}</div>

          {!hasSelectedCompanyRecords && companySelected ? (
            <div style={{ padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a5d00", marginBottom: 12 }}>
              Sin información para esta empresa.
            </div>
          ) : null}

          {data?.errors?.length ? (
            <div style={{ padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a5d00", marginBottom: 12 }}>
              {data.errors.map((error) => <div key={error}>{error}</div>)}
            </div>
          ) : null}

          {data?.warnings?.length ? (
            <div style={{ padding: 12, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", marginBottom: 12 }}>
              {data.warnings.slice(0, 4).map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          ) : null}
        </section>

        <section style={{ marginTop: 20, background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, padding: 20, boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {cards.map((card) => (
              <div key={card.title} style={{ border: "1px solid #edf3ee", borderRadius: 14, padding: 16, background: "#f9fcfa" }}>
                <div style={{ color: "#4b5563", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.title}</div>
                <div style={{ marginTop: 12, fontSize: 28, fontWeight: 800, color: "#183a2a" }}>{card.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 20, background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, padding: 20, boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <FilterSelect label="Empresa" value={filters.empresa === ALL ? ALL : filters.empresa} options={[ALL, ...empresaOptionsWithFallback.map((company) => company.value)]} onChange={(value) => setFilters((current) => ({ ...current, empresa: value }))} />
            <FilterSelect label="Unidad de negocio" value={filters.unidad} options={[ALL, ...available.unidades]} onChange={(value) => setFilters((current) => ({ ...current, unidad: value }))} />
            <FilterSelect label="Territorio" value={filters.territorio} options={[ALL, ...available.territorios]} onChange={(value) => setFilters((current) => ({ ...current, territorio: value }))} />
            <FilterSelect label="Asesor o comercial" value={filters.asesor} options={[ALL, ...available.asesores]} onChange={(value) => setFilters((current) => ({ ...current, asesor: value }))} />
            <FilterSelect label="Cargo" value={filters.cargo} options={[ALL, ...available.cargos]} onChange={(value) => setFilters((current) => ({ ...current, cargo: value }))} />
            <FilterSelect label="Año" value={filters.anio} options={[ALL, ...available.anios.map(String)]} onChange={(value) => setFilters((current) => ({ ...current, anio: value }))} />
            <FilterSelect label="Trimestre" value={filters.trimestre} options={[ALL, ...available.trimestres]} onChange={(value) => setFilters((current) => ({ ...current, trimestre: value }))} />
            <FilterSelect label="Mes" value={filters.mes} options={[ALL, ...available.meses]} onChange={(value) => setFilters((current) => ({ ...current, mes: value }))} />
            <div style={{ display: "flex", alignItems: "end" }}>
              <button type="button" onClick={resetFilters} style={{ width: "100%", border: "1px solid #245c3a", background: "#245c3a", color: "#ffffff", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 20, background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 18, padding: 20, boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <ContextChip label="Empresa" value={companyLabel} />
            <ContextChip label="Unidad de negocio" value={filters.unidad === ALL ? "Todas" : filters.unidad} />
            <ContextChip label="Territorio" value={filters.territorio === ALL ? "Todos" : filters.territorio} />
            <ContextChip label="Asesor" value={filters.asesor === ALL ? "Todos" : filters.asesor} />
            <ContextChip label="Periodo" value={filters.trimestre === ALL ? (filters.mes === ALL ? "Todos" : filters.mes) : `${filters.trimestre}${filters.mes === ALL ? "" : ` • ${filters.mes}`}`} />
            <ContextChip label="Registros filtrados" value={String(filteredRecords.length)} />
            <ContextChip label="Fecha de actualización" value={data ? formatDate(data.updatedAt) : "Cargando..."} />
          </div>
        </section>

        <section style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {allIndicators.map((indicator) => {
            const item = indicator.results[0]
            const value = item?.cumplimientoReconocido ?? null
            const range = getPerformanceLabel(value)
            const quality = item?.estadoCalidad ?? "sin-info"

            return (
              <div key={indicator.key} style={{ background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 16, padding: 18, boxShadow: "0 6px 18px rgba(36, 92, 58, 0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <div style={{ color: "#245c3a", fontWeight: 800, fontSize: 15 }}>{indicator.label}</div>
                    <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{indicator.shortLabel ?? indicator.label}</div>
                  </div>
                  <span style={{ borderRadius: 999, background: quality === "ok" ? "#e7f7ed" : quality === "warning" ? "#fff7ed" : "#f3f4f6", color: quality === "ok" ? "#166534" : quality === "warning" ? "#9a5d00" : "#374151", fontSize: 11, fontWeight: 700, padding: "6px 8px" }}>
                    {quality === "ok" ? "Bueno" : quality === "warning" ? "Advertencia" : "Sin información"}
                  </span>
                </div>

                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Metric label="Gestión real" value={formatNumber(item?.gestionReal ?? null)} />
                  <Metric label="Meta" value={formatNumber(item?.meta ?? null)} />
                  <Metric label="Cumplimiento" value={toPercent(item?.cumplimientoReal ?? null)} />
                  <Metric label="Peso" value={item?.peso ? `${(item.peso * 100).toFixed(0)}%` : "Sin información"} />
                  <Metric label="Aporte" value={toPercent(item?.aportePonderado ?? null)} />
                  <Metric label="Nivel" value={range} />
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </main>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, fontWeight: 700, color: "#1f2937" }}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ border: "1px solid #dfe9e1", borderRadius: 10, padding: "10px 12px", background: "#ffffff", color: "#183a2a", fontSize: 13 }}
      >
        {options.map((option) => (
          <option key={option || "empty"} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #edf3ee", borderRadius: 12, padding: "12px 14px", background: "#f9fcfa" }}>
      <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ marginTop: 8, color: "#183a2a", fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #edf3ee", borderRadius: 12, padding: 10, background: "#f9fcfa" }}>
      <div style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: "#183a2a" }}>{value}</div>
    </div>
  )
}

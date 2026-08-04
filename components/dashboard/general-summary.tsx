"use client"

import { Fragment, useMemo, useState } from "react"
import { exportExecutiveSummaryPdf } from "@/lib/pdf/export-executive-summary-pdf"
import type {
  DashboardView,
  IndividualDashboardPayload,
  IndividualIndicator,
  IndividualSource,
} from "@/types/individual-dashboard"

type GeneralSummaryProps = {
  data: IndividualDashboardPayload
  report: string
}

type PersonSummary = {
  key: string
  person: string
  cargo: string
  profile: string
  territory: string
  sources: IndividualSource[]
}

const PROFILE_ORDER = ["Director", "Comercial", "Promotor"]

const MONTH_ORDER = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"

  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value)
}

function monthSort(a: string, b: string): number {
  const aIndex = MONTH_ORDER.indexOf(a.toLocaleLowerCase("es"))
  const bIndex = MONTH_ORDER.indexOf(b.toLocaleLowerCase("es"))

  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, "es")
  if (aIndex === -1) return 1
  if (bIndex === -1) return -1

  return aIndex - bIndex
}

function profileSort(profile: string): number {
  const index = PROFILE_ORDER.indexOf(profile)
  return index === -1 ? PROFILE_ORDER.length : index
}

function sourceIndicators(source?: IndividualSource): IndividualIndicator[] {
  if (!source) return []

  if (
    source.report === "Galagro Nacional" &&
    source.profile === "Director"
  ) {
    return source.indicators.filter((indicator) => {
      const isHectares =
        indicator.id === "hectareas" ||
        indicator.label === "Hectáreas de cultivos impactados"

      if (!isHectares) return true

      return (
        indicator.calculationType === "promedio_cumplimiento_equipo" &&
        indicator.quarter?.target === 100
      )
    })
  }

  return source.indicators
}

function monthlyGlobalResult(
  source: IndividualSource | undefined,
  month: string,
): number | null {
  if (!source) return null

  const total = sourceIndicators(source).reduce((sum, indicator) => {
    const metric = indicator.monthly.find((item) => item.month === month)
    return sum + (metric?.contribution ?? 0)
  }, 0)

  return Number.isFinite(total) ? total : null
}

function performance(value: number | null) {
  if (value === null) {
    return {
      label: "Sin información",
      background: "#f3f4f6",
      color: "#4b5563",
      border: "#e5e7eb",
    }
  }

  if (value < 0.6) {
    return {
      label: "Requiere mejora",
      background: "#fef2f2",
      color: "#b42318",
      border: "#fecaca",
    }
  }

  if (value < 0.75) {
    return {
      label: "En desarrollo",
      background: "#fff7ed",
      color: "#9a5d00",
      border: "#fed7aa",
    }
  }

  if (value < 0.9) {
    return {
      label: "Destacado",
      background: "#eff8f1",
      color: "#2f6b3d",
      border: "#cce6d2",
    }
  }

  return {
    label: "Excelente",
    background: "#e8f5ec",
    color: "#174f2b",
    border: "#b7ddc2",
  }
}

function ResultCell({
  value,
  title,
}: {
  value: number | null
  title?: string
}) {
  const tone = performance(value)

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        minWidth: 72,
        justifyContent: "center",
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
        borderRadius: 9,
        padding: "7px 9px",
        fontSize: 12,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      {formatPercent(value)}
    </span>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  labels,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  labels?: Record<string, string>
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        color: "#41554a",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          border: "1px solid #d6e3d9",
          background: "#ffffff",
          borderRadius: 11,
          color: "#183a2a",
          padding: "10px 11px",
          fontSize: 13,
          outline: "none",
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  )
}

function getSourceForQuarter(
  row: PersonSummary,
  quarter: string,
): IndividualSource | undefined {
  return row.sources.find((source) => source.quarter === quarter)
}

function getSourceForMonth(
  row: PersonSummary,
  month: string,
): IndividualSource | undefined {
  return row.sources.find((source) => source.months.includes(month))
}

function indicatorKey(indicator: IndividualIndicator): string {
  return indicator.id || indicator.label
}

function indicatorDetails(row: PersonSummary) {
  const indicators = new Map<
    string,
    {
      key: string
      label: string
      weight: number
    }
  >()

  for (const source of row.sources) {
    for (const indicator of sourceIndicators(source)) {
      const key = indicatorKey(indicator)

      if (!indicators.has(key)) {
        indicators.set(key, {
          key,
          label: indicator.label,
          weight: indicator.weight,
        })
      }
    }
  }

  return [...indicators.values()]
}

function findIndicator(
  source: IndividualSource | undefined,
  key: string,
): IndividualIndicator | undefined {
  return sourceIndicators(source).find(
    (indicator) => indicatorKey(indicator) === key,
  )
}

function metricTitle(
  actual: number | null,
  target: number | null,
  contribution: number | null,
  weight: number,
): string {
  return [
    `Gestión real: ${formatNumber(actual)}`,
    `Meta: ${formatNumber(target)}`,
    `Peso: ${formatPercent(weight, 0)}`,
    `Aporte: ${formatPercent(contribution, 2)}`,
  ].join(" | ")
}

export function GeneralSummary({
  data,
  report,
}: GeneralSummaryProps) {
  const years = useMemo(
    () =>
      unique(
        data.sources
          .filter((source) => source.report === report)
          .map((source) => source.year),
      ).sort((a, b) => b - a),
    [data, report],
  )

  const [year, setYear] = useState<number>(years[0] ?? 2026)
  const [profile, setProfile] = useState<string>("Todos")
  const [territory, setTerritory] = useState<string>("Todos")
  const [period, setPeriod] = useState<string>("Todos")
  const [view, setView] = useState<DashboardView>("trimestral")
  const [expandedPerson, setExpandedPerson] = useState<string>("")
  const [exportingPdf, setExportingPdf] = useState(false)

  const selectedYear = years.includes(year) ? year : (years[0] ?? year)

  const reportSources = useMemo(
    () =>
      data.sources.filter(
        (source) =>
          source.report === report &&
          source.year === selectedYear,
      ),
    [data, report, selectedYear],
  )

  const profileOptions = useMemo(
    () => [
      "Todos",
      ...unique(reportSources.map((source) => source.profile)).sort(
        (a, b) => profileSort(a) - profileSort(b),
      ),
    ],
    [reportSources],
  )

  const territoryOptions = useMemo(
    () => [
      "Todos",
      ...unique(
        reportSources
          .filter((source) => source.profile !== "Director")
          .map(
            (source) =>
              source.territory?.trim() ||
              "Territorio sin identificar",
          ),
      ).sort((a, b) =>
        a.localeCompare(b, "es", {
          sensitivity: "base",
        }),
      ),
    ],
    [reportSources],
  )

  const activeTerritory = territoryOptions.includes(territory)
    ? territory
    : "Todos"

  const filteredSources = useMemo(
    () =>
      reportSources.filter((source) => {
        const sourceTerritory =
          source.territory?.trim() ||
          "Territorio sin identificar"

        const matchesRole =
          profile === "Todos" ||
          source.profile === profile

        const matchesTerritory =
          activeTerritory === "Todos" ||
          sourceTerritory === activeTerritory

        return matchesRole && matchesTerritory
      }),
    [reportSources, profile, activeTerritory],
  )

  const periodSources = useMemo(
    () =>
      filteredSources.filter(
        (source) =>
          period === "Todos" ||
          source.quarter === period,
      ),
    [filteredSources, period],
  )

  const rows = useMemo<PersonSummary[]>(() => {
    const people = new Map<string, PersonSummary>()

    for (const source of periodSources) {
      const key = `${source.profile}|||${source.person}`
      const current = people.get(key)

      if (current) {
        current.sources.push(source)
        continue
      }

      people.set(key, {
        key,
        person: source.person,
        cargo: source.cargo ?? source.profile,
        profile: source.profile,
        territory: source.territory ?? "Territorio sin identificar",
        sources: [source],
      })
    }

    return [...people.values()].sort((a, b) => {
      const profileDifference =
        profileSort(a.profile) - profileSort(b.profile)

      if (profileDifference !== 0) return profileDifference

      return a.person.localeCompare(b.person, "es", {
        sensitivity: "base",
      })
    })
  }, [periodSources])

  const months = useMemo(
    () =>
      unique(
        periodSources.flatMap((source) => source.months),
      ).sort(monthSort),
    [periodSources],
  )

  const unitResults = useMemo(() => {
    const result: Record<string, number | null> = {
      Q1: null,
      Q2: null,
    }

    for (const quarter of ["Q1", "Q2"]) {
      const quarterSources = filteredSources.filter(
        (source) => source.quarter === quarter,
      )

      const director = quarterSources.find(
        (source) => source.profile === "Director",
      )

      if (director?.originalQuarterResult !== null && director) {
        result[quarter] = director.originalQuarterResult
        continue
      }

      const values = quarterSources
        .map((source) => source.originalQuarterResult)
        .filter(
          (value): value is number =>
            value !== null && Number.isFinite(value),
        )

      result[quarter] = values.length
        ? values.reduce((sum, value) => sum + value, 0) /
          values.length
        : null
    }

    return result
  }, [filteredSources])

  const visibleQuarters =
    period === "Todos"
      ? ["Q1", "Q2"]
      : [period]

  const tableColumns =
    view === "trimestral"
      ? 4 +
        visibleQuarters.length +
        (period === "Todos" ? 1 : 0)
      : 4 + months.length

  async function handleDownloadPdf() {
    setExportingPdf(true)

    try {
      const activeProfile = profileOptions.includes(profile)
        ? profile
        : "Todos"

      const pdfRows = rows.map((row) => {
        const q1 =
          getSourceForQuarter(row, "Q1")
            ?.originalQuarterResult ?? null

        const q2 =
          getSourceForQuarter(row, "Q2")
            ?.originalQuarterResult ?? null

        const monthly = Object.fromEntries(
          months.map((month) => {
            const source = getSourceForMonth(row, month)

            return [
              month,
              monthlyGlobalResult(source, month),
            ]
          }),
        )

        return {
          person: row.person,
          cargo: row.cargo,
          profile: row.profile,
          territory: row.territory,
          q1,
          q2,
          variation:
            q1 !== null && q2 !== null
              ? q2 - q1
              : null,
          monthly,
        }
      })

      await exportExecutiveSummaryPdf({
        report,
        year: selectedYear,
        profile: activeProfile,
        territory: activeTerritory,
        period,
        view,
        months,
        unitResults,
        rows: pdfRows,
        generatedAt: data.generatedAt,
      })
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <section>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #dfe9e1",
          borderRadius: 17,
          padding: 18,
          boxShadow: "0 5px 18px rgba(36,92,58,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#4f8a5b",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Resumen para Gerencia
            </div>

            <h2 style={{ margin: "5px 0 0", fontSize: 25 }}>
              {report}
            </h2>

            <div
              style={{
                color: "#64748b",
                marginTop: 6,
                fontSize: 13,
              }}
            >
              Comparativo del Director, comerciales y promotores de la
              unidad de negocio.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 4,
              border: "1px solid #dfe9e1",
              borderRadius: 12,
              background: "#f8fbf9",
            }}
          >
            {(["trimestral", "mensual"] as DashboardView[]).map(
              (option) => {
                const active = view === option

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    style={{
                      border: active
                        ? "1px solid #245c3a"
                        : "1px solid transparent",
                      background: active ? "#245c3a" : "transparent",
                      color: active ? "#ffffff" : "#52625a",
                      borderRadius: 9,
                      padding: "9px 13px",
                      fontSize: 12,
                      fontWeight: 850,
                      cursor: "pointer",
                    }}
                  >
                    {option === "trimestral"
                      ? "Trimestral"
                      : "Mensual"}
                  </button>
                )
              },
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          <SelectField
            label="Año"
            value={String(selectedYear)}
            options={years.map(String)}
            onChange={(value) => setYear(Number(value))}
          />

          <SelectField
            label="Rol"
            value={profileOptions.includes(profile) ? profile : "Todos"}
            options={profileOptions}
            onChange={setProfile}
          />

          <SelectField
            label="Territorio"
            value={activeTerritory}
            options={territoryOptions}
            onChange={setTerritory}
          />

          <SelectField
            label="Periodo"
            value={period}
            options={["Todos", "Q1", "Q2"]}
            onChange={setPeriod}
          />
        </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 16,
            }}
          >
            <button
              type="button"
              disabled={exportingPdf || rows.length === 0}
              onClick={() => void handleDownloadPdf()}
              style={{
                border: "1px solid #245c3a",
                background:
                  exportingPdf || rows.length === 0
                    ? "#9db8a5"
                    : "#245c3a",
                color: "#ffffff",
                borderRadius: 11,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 850,
                cursor:
                  exportingPdf || rows.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {exportingPdf
                ? "Generando PDF..."
                : "Descargar PDF del resumen"}
            </button>
          </div>
      </div>

      {view === "trimestral" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          {visibleQuarters.map((quarter) => {
            const value = unitResults[quarter]
            const tone = performance(value)

            return (
              <div
                key={quarter}
                style={{
                  background: tone.background,
                  border: `1px solid ${tone.border}`,
                  color: tone.color,
                  borderRadius: 15,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 850,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                  }}
                >
                  {profile !== "Todos" ||
                  activeTerritory !== "Todos"
                    ? `Resultado del equipo filtrado ${quarter}`
                    : `Resultado de la unidad ${quarter}`}
                </div>

                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    marginTop: 5,
                  }}
                >
                  {formatPercent(value, 2)}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    marginTop: 3,
                  }}
                >
                  {tone.label}
                </div>
              </div>
            )
          })}

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #dfe9e1",
              borderRadius: 15,
              padding: 16,
            }}
          >
            <div
              style={{
                color: "#718078",
                fontSize: 11,
                fontWeight: 850,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              Equipo incluido
            </div>

            <div
              style={{
                color: "#183a2a",
                fontSize: 30,
                fontWeight: 900,
                marginTop: 5,
              }}
            >
              {rows.length}
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: 12,
                marginTop: 3,
              }}
            >
              Personas y posiciones
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          background: "#ffffff",
          border: "1px solid #dfe9e1",
          borderRadius: 17,
          boxShadow: "0 5px 18px rgba(36,92,58,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid #e5ede7",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {view === "trimestral"
              ? "Resultados Q1 y Q2"
              : "Resultados mensuales"}
          </h3>

          <div
            style={{
              color: "#64748b",
              fontSize: 12,
              marginTop: 5,
            }}
          >
            Selecciona “Ver indicadores” para consultar el cumplimiento
            detallado de cada integrante.
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: view === "mensual" ? 1080 : 850,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: "#f3f8f4" }}>
                <th style={headerCellStyle}>Colaborador</th>
                <th style={headerCellStyle}>Cargo</th>
                <th style={headerCellStyle}>Rol</th>

                  {view === "trimestral" ? (
                    <>
                      {visibleQuarters.map((quarter) => (
                        <th
                          key={quarter}
                          style={centerHeaderCellStyle}
                        >
                          {quarter}
                        </th>
                      ))}

                      {period === "Todos" ? (
                        <th style={centerHeaderCellStyle}>
                          Variación
                        </th>
                      ) : null}
                    </>
                  ) : (
                    months.map((month) => (
                      <th
                        key={month}
                        style={centerHeaderCellStyle}
                      >
                        {month}
                      </th>
                    ))
                  )}
                <th style={centerHeaderCellStyle}>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const q1 =
                  getSourceForQuarter(row, "Q1")
                    ?.originalQuarterResult ?? null

                const q2 =
                  getSourceForQuarter(row, "Q2")
                    ?.originalQuarterResult ?? null

                const variation =
                  q1 !== null && q2 !== null ? q2 - q1 : null

                const expanded = expandedPerson === row.key

                return (
                  <Fragment key={row.key}>
                    <tr
                      key={row.key}
                      style={{
                        borderTop: "1px solid #edf2ee",
                        background:
                          row.profile === "Director"
                            ? "#f6fbf7"
                            : "#ffffff",
                      }}
                    >
                      <td style={bodyCellStyle}>
                        <div
                          style={{
                            fontWeight: 850,
                            color: "#183a2a",
                          }}
                        >
                          {row.person}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            color: "#7a8b81",
                            fontSize: 11,
                          }}
                        >
                          {row.territory}
                        </div>
                      </td>

                      <td style={bodyCellStyle}>{row.cargo}</td>

                      <td style={bodyCellStyle}>
                        <span
                          style={{
                            display: "inline-flex",
                            border: "1px solid #d7e6da",
                            background: "#f3f8f4",
                            color: "#315e3c",
                            borderRadius: 999,
                            padding: "5px 8px",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {row.profile}
                        </span>
                      </td>

                        {view === "trimestral" ? (
                          <>
                            {visibleQuarters.map((quarter) => (
                              <td
                                key={quarter}
                                style={centerBodyCellStyle}
                              >
                                <ResultCell
                                  value={
                                    quarter === "Q1"
                                      ? q1
                                      : q2
                                  }
                                />
                              </td>
                            ))}

                            {period === "Todos" ? (
                              <td style={centerBodyCellStyle}>
                                <span
                                  style={{
                                    fontWeight: 850,
                                    color:
                                      variation === null
                                        ? "#7a8b81"
                                        : variation >= 0
                                          ? "#2f6b3d"
                                          : "#b42318",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {variation === null
                                    ? "—"
                                    : `${variation >= 0 ? "+" : ""}${(
                                        variation * 100
                                      ).toFixed(2)} pp`}
                                </span>
                              </td>
                            ) : null}
                          </>
                        ) : (
                          months.map((month) => {
                            const source =
                              getSourceForMonth(row, month)

                            return (
                              <td
                                key={month}
                                style={centerBodyCellStyle}
                              >
                                <ResultCell
                                  value={monthlyGlobalResult(
                                    source,
                                    month,
                                  )}
                                />
                              </td>
                            )
                          })
                        )}
                      <td style={centerBodyCellStyle}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPerson(
                              expanded ? "" : row.key,
                            )
                          }
                          style={{
                            border: "1px solid #4f8a5b",
                            background: expanded
                              ? "#245c3a"
                              : "#ffffff",
                            color: expanded
                              ? "#ffffff"
                              : "#245c3a",
                            borderRadius: 9,
                            padding: "7px 10px",
                            fontSize: 11,
                            fontWeight: 850,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {expanded ? "Ocultar" : "Ver indicadores"}
                        </button>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr key={`${row.key}-detail`}>
                        <td
                          colSpan={tableColumns}
                          style={{
                            padding: 0,
                            background: "#f9fcfa",
                            borderTop: "1px solid #dfe9e1",
                            borderBottom: "1px solid #dfe9e1",
                          }}
                        >
                          <div
                            style={{
                              padding: 16,
                              overflowX: "auto",
                            }}
                          >
                            <div
                              style={{
                                color: "#245c3a",
                                fontWeight: 850,
                                marginBottom: 10,
                              }}
                            >
                              Cumplimiento por indicador
                            </div>

                            <table
                              style={{
                                width: "100%",
                                minWidth:
                                  view === "mensual" ? 900 : 520,
                                borderCollapse: "collapse",
                                background: "#ffffff",
                                border: "1px solid #e1eae3",
                              }}
                            >
                              <thead>
                                <tr style={{ background: "#eef6f0" }}>
                                  <th style={headerCellStyle}>
                                    Indicador
                                  </th>

                                    {view === "trimestral" ? (
                                      visibleQuarters.map(
                                        (quarter) => (
                                          <th
                                            key={quarter}
                                            style={
                                              centerHeaderCellStyle
                                            }
                                          >
                                            {quarter}
                                          </th>
                                        ),
                                      )
                                    ) : (
                                      months.map((month) => (
                                        <th
                                          key={month}
                                          style={
                                            centerHeaderCellStyle
                                          }
                                        >
                                          {month}
                                        </th>
                                      ))
                                    )}
                                </tr>
                              </thead>

                              <tbody>
                                {indicatorDetails(row).map(
                                  (detail) => (
                                    <tr
                                      key={detail.key}
                                      style={{
                                        borderTop:
                                          "1px solid #edf2ee",
                                      }}
                                    >
                                      <td style={bodyCellStyle}>
                                        <div
                                          style={{
                                            fontWeight: 800,
                                            color: "#253d30",
                                          }}
                                        >
                                          {detail.label}
                                        </div>

                                        <div
                                          style={{
                                            color: "#7a8b81",
                                            fontSize: 10,
                                            marginTop: 3,
                                          }}
                                        >
                                          Peso{" "}
                                          {formatPercent(
                                            detail.weight,
                                            0,
                                          )}
                                        </div>
                                      </td>

                                      {view === "trimestral" ? (
                                        visibleQuarters.map(
                                          (quarter) => {
                                            const source =
                                              getSourceForQuarter(
                                                row,
                                                quarter,
                                              )

                                            const indicator =
                                              findIndicator(
                                                source,
                                                detail.key,
                                              )

                                            const metric =
                                              indicator?.quarter

                                            return (
                                              <td
                                                key={quarter}
                                                style={
                                                  centerBodyCellStyle
                                                }
                                              >
                                                <ResultCell
                                                  value={
                                                    metric?.recognizedCompliance ??
                                                    null
                                                  }
                                                  title={metricTitle(
                                                    metric?.actual ??
                                                      null,
                                                    metric?.target ??
                                                      null,
                                                    metric?.contribution ??
                                                      null,
                                                    indicator?.weight ??
                                                      detail.weight,
                                                  )}
                                                />
                                              </td>
                                            )
                                          },
                                        )
                                      ) : (
                                        months.map((month) => {
                                          const source =
                                            getSourceForMonth(
                                              row,
                                              month,
                                            )

                                          const indicator =
                                            findIndicator(
                                              source,
                                              detail.key,
                                            )

                                          const metric =
                                            indicator?.monthly.find(
                                              (item) =>
                                                item.month === month,
                                            )

                                          return (
                                            <td
                                              key={month}
                                              style={
                                                centerBodyCellStyle
                                              }
                                            >
                                              <ResultCell
                                                value={
                                                  metric?.recognizedCompliance ??
                                                  null
                                                }
                                                title={metricTitle(
                                                  metric?.actual ??
                                                    null,
                                                  metric?.target ??
                                                    null,
                                                  metric?.contribution ??
                                                    null,
                                                  indicator?.weight ??
                                                    detail.weight,
                                                )}
                                              />
                                            </td>
                                          )
                                        })
                                      )}
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>

                            <div
                              style={{
                                marginTop: 9,
                                color: "#718078",
                                fontSize: 11,
                              }}
                            >
                              Pasa el cursor sobre un porcentaje para
                              consultar gestión real, meta, peso y aporte.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}

              {!rows.length ? (
                <tr>
                  <td
                    colSpan={tableColumns}
                    style={{
                      padding: 28,
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    No existen resultados para los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

const headerCellStyle = {
  padding: "12px 14px",
  textAlign: "left" as const,
  color: "#52625a",
  fontSize: 11,
  fontWeight: 850,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  whiteSpace: "nowrap" as const,
}

const centerHeaderCellStyle = {
  ...headerCellStyle,
  textAlign: "center" as const,
}

const bodyCellStyle = {
  padding: "12px 14px",
  color: "#41554a",
  verticalAlign: "middle" as const,
}

const centerBodyCellStyle = {
  ...bodyCellStyle,
  textAlign: "center" as const,
}

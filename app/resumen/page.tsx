"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { GeneralSummary } from "@/components/dashboard/general-summary"
import type { IndividualDashboardPayload } from "@/types/individual-dashboard"

const REPORT_ORDER = [
  "Agrícola Antioquia",
  "Galagro Antioquia",
  "Galagro Nacional",
]

export default function ExecutiveSummaryPage() {
  const [data, setData] =
    useState<IndividualDashboardPayload | null>(null)
  const [selectedReport, setSelectedReport] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/dashboard-data?t=${Date.now()}`,
        { cache: "no-store" },
      )

      const payload =
        (await response.json()) as IndividualDashboardPayload

      if (!response.ok) {
        throw new Error(
          payload.errors?.[0] ??
            "No fue posible cargar el resumen ejecutivo",
        )
      }

      setData(payload)

      const reportOptions = [
        ...new Set(
          payload.sources.map((source) => source.report),
        ),
      ].sort(
        (a, b) =>
          REPORT_ORDER.indexOf(a) -
          REPORT_ORDER.indexOf(b),
      )

      setSelectedReport((current) =>
        reportOptions.includes(current)
          ? current
          : (reportOptions[0] ?? ""),
      )
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Error al cargar la información",
      )
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const reports = useMemo(
    () =>
      [
        ...new Set(
          (data?.sources ?? []).map(
            (source) => source.report,
          ),
        ),
      ].sort(
        (a, b) =>
          REPORT_ORDER.indexOf(a) -
          REPORT_ORDER.indexOf(b),
      ),
    [data],
  )

  if (loading) {
    return (
      <CenteredState
        title="Cargando resumen ejecutivo"
        detail="Preparando los resultados de las unidades de negocio."
      />
    )
  }

  if (error || !data || !selectedReport) {
    return (
      <CenteredState
        title="No fue posible cargar el resumen"
        detail={
          error ??
          "No existen fuentes disponibles para presentar."
        }
      />
    )
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5faf6",
        color: "#183a2a",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(255,255,255,0.97)",
          borderBottom: "1px solid #dfe9e1",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "18px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.11em",
                  color: "#4f8a5b",
                  textTransform: "uppercase",
                }}
              >
                Gestión comercial
              </div>

              <h1
                style={{
                  margin: "4px 0 0",
                  fontSize: 28,
                  lineHeight: 1.15,
                }}
              >
                Resumen ejecutivo C4C
              </h1>

              <div
                style={{
                  marginTop: 6,
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Comparativo trimestral, mensual y por
                indicadores
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 18,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 176,
                    height: 62,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ffffff",
                    border: "1px solid #e4ece6",
                    borderRadius: 12,
                    padding: 8,
                  }}
                >
                  <Image
                    src="/logos/perez-cardona.png"
                    alt="Pérez y Cardona"
                    width={1656}
                    height={644}
                    priority
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>

                <div
                  style={{
                    width: 104,
                    height: 62,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ffffff",
                    border: "1px solid #e4ece6",
                    borderRadius: 12,
                    padding: 6,
                  }}
                >
                  <Image
                    src="/logos/galagro.png"
                    alt="Galagro"
                    width={1000}
                    height={700}
                    priority
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link href="/" style={secondaryButton}>
                  Volver al informe individual
                </Link>

                <button
                  type="button"
                  onClick={() => void loadData()}
                  style={secondaryButton}
                >
                  Actualizar datos
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            {reports.map((report) => {
              const active = selectedReport === report

              return (
                <button
                  key={report}
                  type="button"
                  onClick={() => setSelectedReport(report)}
                  style={{
                    border: active
                      ? "1px solid #4f8a5b"
                      : "1px solid #dfe9e1",
                    background: active
                      ? "#eaf5ec"
                      : "#ffffff",
                    color: active
                      ? "#245c3a"
                      : "#52625a",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {report}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "22px 24px 48px",
        }}
      >
        <GeneralSummary
          data={data}
          report={selectedReport}
        />
      </div>
    </main>
  )
}

function CenteredState({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5faf6",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#ffffff",
          border: "1px solid #dfe9e1",
          borderRadius: 18,
          padding: 28,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#183a2a",
            fontSize: 24,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: "10px 0 0",
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          {detail}
        </p>
      </div>
    </main>
  )
}

const secondaryButton = {
  border: "1px solid #4f8a5b",
  background: "#ffffff",
  color: "#245c3a",
  borderRadius: 11,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
}

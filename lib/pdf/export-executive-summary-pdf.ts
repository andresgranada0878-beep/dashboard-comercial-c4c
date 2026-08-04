import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import type { DashboardView } from "@/types/individual-dashboard"

export type ExecutiveSummaryPdfRow = {
  person: string
  cargo: string
  profile: string
  territory: string
  q1: number | null
  q2: number | null
  variation: number | null
  monthly: Record<string, number | null>
}

type ExportExecutiveSummaryPdfParams = {
  report: string
  year: number
  profile: string
  territory: string
  period: string
  view: DashboardView
  months: string[]
  unitResults: Record<string, number | null>
  rows: ExecutiveSummaryPdfRow[]
  generatedAt: string
}

function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "-"
  }

  return `${new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value * 100)} %`
}

function formatVariation(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "-"
  }

  const formatted = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * 100)

  return `${value >= 0 ? "+" : ""}${formatted} pp`
}

function formatDate(value: string): string {
  if (!value) return "-"

  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function safeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

async function loadImageDataUrl(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetch(url)

    if (!response.ok) return null

    const blob = await response.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function exportExecutiveSummaryPdf({
  report,
  year,
  profile,
  territory,
  period,
  view,
  months,
  unitResults,
  rows,
  generatedAt,
}: ExportExecutiveSummaryPdfParams): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const isGalagro = report.includes("Galagro")

  const companyLogo = await loadImageDataUrl(
    isGalagro
      ? "/logos/galagro.png"
      : "/logos/perez-cardona.png",
  )

  doc.setFillColor(245, 250, 246)
  doc.rect(0, 0, pageWidth, 37, "F")

  const titleX = isGalagro ? 52 : 68

  if (companyLogo) {
    doc.addImage(
      companyLogo,
      "PNG",
      14,
      isGalagro ? 7 : 8,
      isGalagro ? 27 : 43,
      isGalagro ? 19 : 17,
      undefined,
      "FAST",
    )
  }

  doc.setTextColor(36, 92, 58)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text("Resumen ejecutivo de indicadores C4C", titleX, 14)

  doc.setTextColor(100, 116, 139)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`${report} - ${year}`, titleX, 21)

  doc.setTextColor(24, 58, 42)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  const comparisonTitle =
    view === "trimestral"
      ? period === "Todos"
        ? "Comparativo trimestral Q1 - Q2"
        : `Resumen trimestral ${period}`
      : period === "Todos"
        ? "Comparativo mensual del equipo"
        : `Comparativo mensual ${period}`

  doc.text(comparisonTitle, 14, 47)

  const resultScope =
    profile !== "Todos" || territory !== "Todos"
      ? "equipo filtrado"
      : "unidad"

  const visibleQuarters =
    period === "Todos"
      ? ["Q1", "Q2"]
      : [period]

  const peopleLabel = `${rows.length} ${
    rows.length === 1 ? "persona" : "personas"
  }`

  const summaryItems =
    view === "trimestral"
      ? period === "Todos"
        ? [
            ["Rol", profile],
            ["Territorio", territory],
            ["Equipo incluido", peopleLabel],
            [
              `Resultado ${resultScope} Q1`,
              formatPercent(unitResults.Q1, 2),
            ],
            [
              `Resultado ${resultScope} Q2`,
              formatPercent(unitResults.Q2, 2),
            ],
          ]
        : [
            ["Rol", profile],
            ["Territorio", territory],
            ["Periodo", period],
            ["Equipo incluido", peopleLabel],
            [
              `Resultado ${resultScope} ${period}`,
              formatPercent(unitResults[period], 2),
            ],
          ]
      : [
          ["Rol", profile],
          ["Territorio", territory],
          ["Periodo", period],
          ["Equipo incluido", peopleLabel],
          ["Meses", months.join(", ")],
        ]

  const summaryY = 54
  const gap = 4
  const availableWidth = pageWidth - 28
  const boxWidth =
    (availableWidth - gap * (summaryItems.length - 1)) /
    summaryItems.length

  summaryItems.forEach(([label, value], index) => {
    const x = 14 + index * (boxWidth + gap)

    doc.setFillColor(250, 252, 251)
    doc.setDrawColor(223, 233, 225)
    doc.roundedRect(x, summaryY, boxWidth, 17, 2, 2, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(113, 128, 120)
    doc.text(label.toUpperCase(), x + 3, summaryY + 5)

    doc.setFontSize(9)
    doc.setTextColor(24, 58, 42)
    doc.text(
      doc.splitTextToSize(value, boxWidth - 6),
      x + 3,
      summaryY + 11,
    )
  })

  const head =
    view === "trimestral"
      ? [[
          "Colaborador",
          "Cargo",
          "Rol",
          "Territorio",
          ...visibleQuarters,
          ...(period === "Todos" ? ["Variación"] : []),
        ]]
      : [[
          "Colaborador",
          "Cargo",
          "Rol",
          "Territorio",
          ...months,
        ]]

  const body =
    view === "trimestral"
      ? rows.map((row) => [
          row.person,
          row.cargo,
          row.profile,
          row.territory,
          ...visibleQuarters.map((quarter) =>
            formatPercent(
              quarter === "Q1"
                ? row.q1
                : row.q2,
            ),
          ),
          ...(period === "Todos"
            ? [formatVariation(row.variation)]
            : []),
        ])
      : rows.map((row) => [
          row.person,
          row.cargo,
          row.profile,
          row.territory,
          ...months.map((month) =>
            formatPercent(row.monthly[month]),
          ),
        ])

  const columnStyles =
    view === "trimestral"
      ? period === "Todos"
        ? {
            0: { cellWidth: 48 },
            1: { cellWidth: 54 },
            2: { cellWidth: 25, halign: "center" as const },
            3: { cellWidth: 47 },
            4: { cellWidth: 23, halign: "center" as const },
            5: { cellWidth: 23, halign: "center" as const },
            6: { cellWidth: 25, halign: "center" as const },
          }
        : {
            0: { cellWidth: 55 },
            1: { cellWidth: 62 },
            2: { cellWidth: 30, halign: "center" as const },
            3: { cellWidth: 75 },
            4: { cellWidth: 30, halign: "center" as const },
          }
      : {
          0: { cellWidth: 42 },
          1: { cellWidth: 44 },
          2: { cellWidth: 21, halign: "center" as const },
          3: { cellWidth: 39 },
        }

  autoTable(doc, {
    startY:
      view === "trimestral" && period !== "Todos"
        ? 75
        : 78,
    pageBreak: "auto",
    rowPageBreak: "avoid",
    head,
    body,
    theme: "grid",
    margin: {
      left: 12,
      right: 12,
      bottom: 18,
    },
    styles: {
      font: "helvetica",
      fontSize:
        view === "trimestral"
          ? period === "Todos"
            ? 7.5
            : 7.1
          : 6.7,
      cellPadding:
        view === "trimestral" && period !== "Todos"
          ? 1.6
          : 2.1,
      lineColor: [225, 234, 227],
      lineWidth: 0.2,
      textColor: [37, 61, 48],
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [36, 92, 58],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles,
    alternateRowStyles: {
      fillColor: [248, 251, 249],
    },
    didParseCell: (cellData) => {
      if (
        cellData.section === "body" &&
        Array.isArray(cellData.row.raw) &&
        cellData.row.raw[2] === "Director"
      ) {
        cellData.cell.styles.fillColor = [234, 245, 236]
        cellData.cell.styles.fontStyle = "bold"
      }
    },
  })

  const pageCount = doc.getNumberOfPages()

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)

    doc.setDrawColor(223, 233, 225)
    doc.line(
      12,
      pageHeight - 12,
      pageWidth - 12,
      pageHeight - 12,
    )

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.3)
    doc.setTextColor(100, 116, 139)

    doc.text(
      `Unidad: ${report} | Rol: ${profile} | Territorio: ${territory} | Periodo: ${period}`,
      12,
      pageHeight - 7,
    )

    doc.text(
      `Datos generados: ${formatDate(generatedAt)}`,
      pageWidth / 2,
      pageHeight - 7,
      { align: "center" },
    )

    doc.text(
      `Página ${page} de ${pageCount}`,
      pageWidth - 12,
      pageHeight - 7,
      { align: "right" },
    )
  }

  const fileName = [
    "resumen-ejecutivo-c4c",
    safeFileName(report),
    safeFileName(profile),
    safeFileName(territory),
    safeFileName(period),
    String(year),
    view,
  ].join("-")

  doc.save(`${fileName}.pdf`)
}

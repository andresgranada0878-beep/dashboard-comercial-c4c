import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import type {
  DashboardView,
  IndividualIndicator,
  IndividualSource,
  MonthlyIndicatorValue,
  QuarterIndicatorValue,
} from "@/types/individual-dashboard"

type IndicatorMetric =
  | MonthlyIndicatorValue
  | QuarterIndicatorValue
  | null

type IndividualPdfRow = {
  indicator: IndividualIndicator
  metric: IndicatorMetric
}

type ExportIndividualPdfParams = {
  source: IndividualSource
  view: DashboardView
  month: string
  globalResult: number | null
  rows: IndividualPdfRow[]
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

function formatNumber(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "-"
  }

  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(value)
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

function performanceLabel(value: number | null): string {
  if (value === null) return "Sin información"
  if (value < 0.6) return "Requiere mejora"
  if (value < 0.75) return "En desarrollo"
  if (value < 0.9) return "Destacado"
  return "Excelente"
}

function calculationLabel(value: string): string {
  if (value === "ratio_acumulado") return "Acumulado / meta"
  if (value === "promedio_mensual") return "Promedio mensual"
  if (value === "ratio") return "Gestión / meta"
  if (value === "promedio_cumplimiento_equipo") {
    return "Promedio cumplimiento equipo"
  }

  return value.replaceAll("_", " ")
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

export async function exportIndividualPdf({
  source,
  view,
  month,
  globalResult,
  rows,
  generatedAt,
}: ExportIndividualPdfParams): Promise<void> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const isGalagro = source.report.includes("Galagro")

  const companyLogo = await loadImageDataUrl(
    isGalagro
      ? "/logos/galagro.png"
      : "/logos/perez-cardona.png",
  )

  doc.setFillColor(245, 250, 246)
  doc.rect(0, 0, pageWidth, 38, "F")

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
  doc.text(
    "Informe individual de indicadores C4C",
    titleX,
    14,
  )

  doc.setTextColor(100, 116, 139)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(
    `${source.report} - ${source.year}`,
    titleX,
    21,
  )

  const period =
    view === "trimestral"
      ? `${source.quarter} - ${source.months.join(", ")}`
      : `${month} - ${source.year}`

  doc.setTextColor(24, 58, 42)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(source.person, 14, 48)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.setTextColor(82, 98, 90)

  doc.text(
    `${source.cargo ?? source.profile} - ${
      source.territory ?? "Territorio sin identificar"
    }`,
    14,
    55,
  )

  const summaryX = 14
  const summaryY = 64
  const boxWidth = 50
  const boxHeight = 18
  const boxGap = 4

  const summaries = [
    ["Perfil", source.profile],
    ["Periodo", period],
    ["Resultado", formatPercent(globalResult, 2)],
    ["Nivel", performanceLabel(globalResult)],
    ["Validación", source.validationStatus],
  ]

  summaries.forEach(([label, value], index) => {
    const x = summaryX + index * (boxWidth + boxGap)

    doc.setFillColor(250, 252, 251)
    doc.setDrawColor(223, 233, 225)
    doc.roundedRect(x, summaryY, boxWidth, boxHeight, 2, 2, "FD")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(113, 128, 120)
    doc.text(label.toUpperCase(), x + 3, summaryY + 5)

    doc.setFontSize(9.5)
    doc.setTextColor(24, 58, 42)
    doc.text(
      doc.splitTextToSize(value, boxWidth - 6),
      x + 3,
      summaryY + 11,
    )
  })

  const tableBody = rows
    .filter(({ indicator }) => {
      const normalizedLabel = indicator.label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()

      return (
        indicator.id !== "gestion-cultivos-impactados" &&
        indicator.id !== "gestion_cultivos_impactados" &&
        normalizedLabel !== "gestion de cultivos impactados"
      )
    })
    .map(({ indicator, metric }) => [
    indicator.label,
    formatNumber(metric?.actual),
    formatNumber(metric?.target),
    formatPercent(metric?.recognizedCompliance),
    formatPercent(indicator.weight, 0),
    formatPercent(metric?.contribution, 2),
    calculationLabel(indicator.calculationType),
  ])

  autoTable(doc, {
    startY: 88,
    head: [[
      "Indicador",
      "Gestión real",
      "Meta",
      "Cumplimiento",
      "Peso",
      "Aporte",
      "Tipo de cálculo",
    ]],
    body: tableBody,
    theme: "grid",
    margin: {
      left: 14,
      right: 14,
      bottom: 18,
    },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.4,
      lineColor: [225, 234, 227],
      lineWidth: 0.2,
      textColor: [37, 61, 48],
      valign: "middle",
    },
    headStyles: {
      fillColor: [36, 92, 58],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: {
        cellWidth: 76,
        fontStyle: "bold",
        halign: "left",
      },
      1: {
        cellWidth: 27,
        halign: "right",
      },
      2: {
        cellWidth: 27,
        halign: "right",
      },
      3: {
        cellWidth: 30,
        halign: "center",
      },
      4: {
        cellWidth: 20,
        halign: "center",
      },
      5: {
        cellWidth: 24,
        halign: "center",
      },
      6: {
        cellWidth: 48,
        halign: "left",
      },
    },
    alternateRowStyles: {
      fillColor: [248, 251, 249],
    },
  })

  const pageCount = doc.getNumberOfPages()

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)

    doc.setDrawColor(223, 233, 225)
    doc.line(
      14,
      pageHeight - 12,
      pageWidth - 14,
      pageHeight - 12,
    )

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)

    doc.text(
      `Fuente: ${source.sourceFile}`,
      14,
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
      pageWidth - 14,
      pageHeight - 7,
      { align: "right" },
    )
  }

  const fileName = [
    "informe-c4c",
    safeFileName(source.report),
    safeFileName(source.person),
    safeFileName(
      view === "trimestral"
        ? source.quarter
        : month,
    ),
  ].join("-")

  doc.save(`${fileName}.pdf`)
}

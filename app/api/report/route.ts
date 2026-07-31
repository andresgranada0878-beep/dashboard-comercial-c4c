import { NextResponse } from "next/server"
import { ExcelDashboardDataProvider } from "@/lib/data-provider"

export const dynamic = "force-dynamic"

// Sirve el dataset normalizado (parseo del Excel en el servidor).
export async function GET() {
  try {
    const provider = new ExcelDashboardDataProvider()
    const data = await provider.load()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error al cargar el informe:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido al procesar el informe." },
      { status: 500 },
    )
  }
}

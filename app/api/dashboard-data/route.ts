import fs from "node:fs/promises"
import path from "node:path"
import { NextResponse, type NextRequest } from "next/server"
import { readAuthConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session.mjs"
import type { IndividualDashboardPayload } from "@/types/individual-dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const auth = readAuthConfig()
  if (!auth || !verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, auth.secret)) {
    return NextResponse.json({ error: "Sesión requerida" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  try {
    const filePath = path.join(process.cwd(), "data", "generated", "individual-c4c.json")
    const contents = await fs.readFile(filePath, "utf8")
    const payload = JSON.parse(contents) as IndividualDashboardPayload

    return NextResponse.json(
      {
        ...payload,
        servedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    )
  } catch (error) {
    return NextResponse.json(
      {
        generatedAt: null,
        scope: "Resultados individuales",
        source: "No disponible",
        reports: [],
        sources: [],
        errors: [error instanceof Error ? error.message : "No fue posible cargar la información individual"],
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }
}

import { NextResponse, type NextRequest } from "next/server"
import { createSessionToken, readAuthConfig, safeNextPath, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth/session.mjs"

export const dynamic = "force-dynamic"

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
const failures = new Map<string, { count: number; first: number }>()

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local"
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const next = safeNextPath(form?.get("next"))
  const loginWith = (error: string) => redirectTo(request, `/login?error=${error}&next=${encodeURIComponent(next)}`)
  const auth = readAuthConfig()
  if (!auth) return loginWith("config")

  // Best effort per instance; serverless instances do not share this counter.
  const key = clientKey(request)
  const now = Date.now()
  const entry = failures.get(key)
  if (entry && now - entry.first > WINDOW_MS) failures.delete(key)
  if ((failures.get(key)?.count ?? 0) >= MAX_FAILURES) return loginWith("bloqueado")

  const password = form?.get("password")
  if (typeof password !== "string" || !verifyPassword(password, auth.passwordHash)) {
    const current = failures.get(key) ?? { count: 0, first: now }
    failures.set(key, { count: current.count + 1, first: current.first })
    return loginWith("1")
  }
  failures.delete(key)
  const response = redirectTo(request, next)
  response.cookies.set(SESSION_COOKIE, createSessionToken(auth.secret), sessionCookieOptions(request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production"))
  return response
}

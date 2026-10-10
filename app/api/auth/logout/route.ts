import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session.mjs"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303, headers: { "Cache-Control": "no-store" } })
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production"), maxAge: 0 })
  return response
}

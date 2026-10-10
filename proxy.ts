import { NextResponse, type NextRequest } from "next/server"
import { readAuthConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session.mjs"

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"])

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()
  const isApi = pathname.startsWith("/api/")
  const auth = readAuthConfig()
  if (!auth) {
    const message = "Autenticación no configurada: defina AUTH_SECRET y AUTH_PASSWORD_HASH."
    return isApi ? NextResponse.json({ error: message }, { status: 503 }) : new NextResponse(message, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, auth.secret)) {
    const response = NextResponse.next()
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
  if (isApi) return NextResponse.json({ error: "Sesión requerida" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  const login = new URL("/login", request.url)
  login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel/|favicon.ico|icon.svg|icon-dark-32x32.png|icon-light-32x32.png|apple-icon.png|logos/).*)"],
}

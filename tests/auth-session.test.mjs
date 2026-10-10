import test from "node:test"
import assert from "node:assert/strict"
import { createSessionToken, hashPassword, readAuthConfig, safeNextPath, verifyPassword, verifySessionToken, SESSION_MAX_AGE_SECONDS } from "../lib/auth/session.mjs"

const SECRET = "s".repeat(40)

test("password hash verifies only the original password", () => {
  const stored = hashPassword("contraseña de prueba larga")
  assert.ok(stored.startsWith("scrypt:"))
  assert.equal(verifyPassword("contraseña de prueba larga", stored), true)
  assert.equal(verifyPassword("otra contraseña", stored), false)
  assert.equal(verifyPassword("", stored), false)
  assert.equal(verifyPassword("x", "texto-plano"), false)
})

test("session token: signature, tampering, expiry and secret rotation", () => {
  const now = Date.UTC(2026, 9, 9, 12)
  const token = createSessionToken(SECRET, now)
  assert.equal(verifySessionToken(token, SECRET, now), true)
  assert.equal(verifySessionToken(token, SECRET, now + (SESSION_MAX_AGE_SECONDS + 1) * 1000), false)
  assert.equal(verifySessionToken(token, "t".repeat(40), now), false)
  const [payload, signature] = token.split(".")
  const forged = Buffer.from(JSON.stringify({ iat: 0, exp: 9999999999, sid: "x" })).toString("base64url")
  assert.equal(verifySessionToken(forged + "." + signature, SECRET, now), false)
  assert.equal(verifySessionToken(payload, SECRET, now), false)
  assert.equal(verifySessionToken(undefined, SECRET, now), false)
})

test("auth fails closed when configuration is missing or weak", () => {
  assert.equal(readAuthConfig({}), null)
  assert.equal(readAuthConfig({ AUTH_SECRET: "corto", AUTH_PASSWORD_HASH: hashPassword("contraseña de prueba larga") }), null)
  assert.equal(readAuthConfig({ AUTH_SECRET: SECRET, AUTH_PASSWORD_HASH: "plano" }), null)
  assert.ok(readAuthConfig({ AUTH_SECRET: SECRET, AUTH_PASSWORD_HASH: hashPassword("contraseña de prueba larga") }))
})

test("post-login redirect stays on the same site", () => {
  assert.equal(safeNextPath("/agricola-q3?x=1"), "/agricola-q3?x=1")
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/dashboard-data", null]) assert.equal(safeNextPath(value), "/")
})

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "c4c_session"
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
const MIN_SECRET_LENGTH = 32

// Fails closed: without both variables no session can be issued or accepted.
export function readAuthConfig(env = process.env) {
  const secret = env.AUTH_SECRET ?? ""
  const passwordHash = env.AUTH_PASSWORD_HASH ?? ""
  if (secret.length < MIN_SECRET_LENGTH || !passwordHash.startsWith("scrypt:")) return null
  return { secret, passwordHash }
}

const base64url = buffer => Buffer.from(buffer).toString("base64url")
const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest()

export function createSessionToken(secret, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000)
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + SESSION_MAX_AGE_SECONDS, sid: randomBytes(16).toString("hex") }))
  return payload + "." + base64url(sign(payload, secret))
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !secret) return false
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra !== undefined) return false
  const expected = sign(payload, secret)
  const received = Buffer.from(signature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    const seconds = Math.floor(now / 1000)
    return Number.isInteger(data.exp) && Number.isInteger(data.iat) && data.iat <= seconds + 60 && seconds < data.exp
  } catch {
    return false
  }
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password, salt = randomBytes(16)) {
  const hash = scryptSync(String(password).normalize("NFC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, base64url(salt), base64url(hash)].join(":")
}

// ":" separators: "$" would be expanded as a variable by .env loaders.
export function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split(":")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, "base64url")
  if (!expected.length) return false
  try {
    const actual = scryptSync(String(password ?? "").normalize("NFC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function sessionCookieOptions(secure) {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS }
}

// Only same-origin relative paths are accepted as post-login destinations.
export function safeNextPath(value) {
  const path = String(value ?? "")
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.startsWith("/login") || path.startsWith("/api/")) return "/"
  return path
}

export const SESSION_COOKIE: string
export const SESSION_MAX_AGE_SECONDS: number
export function readAuthConfig(env?: Record<string, string | undefined>): { secret: string; passwordHash: string } | null
export function createSessionToken(secret: string, now?: number): string
export function verifySessionToken(token: string | undefined, secret: string, now?: number): boolean
export function hashPassword(password: string, salt?: Buffer): string
export function verifyPassword(password: string, stored: string): boolean
export function sessionCookieOptions(secure: boolean): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number }
export function safeNextPath(value: unknown): string

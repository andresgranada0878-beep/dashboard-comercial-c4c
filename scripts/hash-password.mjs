// Usage: node scripts/hash-password.mjs  (reads the password from stdin so it does not land in shell history)
import { randomBytes } from "node:crypto"
import { createInterface } from "node:readline"
import { hashPassword } from "../lib/auth/session.mjs"

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY })
rl.question("Contraseña del sitio (mínimo 12 caracteres): ", password => {
  rl.close()
  if (!password || password.length < 12) {
    console.error("La contraseña debe tener al menos 12 caracteres.")
    process.exit(1)
  }
  console.log("AUTH_PASSWORD_HASH=" + hashPassword(password))
  console.log("AUTH_SECRET=" + randomBytes(48).toString("base64url"))
})

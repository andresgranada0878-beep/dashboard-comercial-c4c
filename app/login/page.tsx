import Image from "next/image"
import { safeNextPath } from "@/lib/auth/session.mjs"

export const dynamic = "force-dynamic"

const MESSAGES: Record<string, string> = {
  "1": "Contraseña incorrecta.",
  bloqueado: "Demasiados intentos. Espera 15 minutos e intenta de nuevo.",
  config: "El acceso no está configurado en este entorno. Contacta al administrador.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const next = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next)
  const error = MESSAGES[String(params.error ?? "")]
  return (
    <main style={{ minHeight: "100vh", background: "#f5faf6", color: "#183a2a", display: "grid", placeItems: "center", padding: 24 }}>
      <form action="/api/auth/login" method="post" style={{ width: "100%", maxWidth: 400, background: "#ffffff", border: "1px solid #dfe9e1", borderRadius: 17, padding: 28, boxShadow: "0 5px 18px rgba(36,92,58,0.06)" }}>
        <div style={{ width: 176, height: 62, margin: "0 auto 18px" }}>
          <Image src="/logos/perez-cardona.png" alt="Pérez y Cardona" width={1656} height={644} priority style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.11em", color: "#4f8a5b", textTransform: "uppercase" }}>Gestión comercial</div>
        <h1 style={{ margin: "4px 0 18px", fontSize: 24 }}>Indicadores C4C</h1>
        <input type="hidden" name="next" value={next} />
        <label style={{ display: "flex", flexDirection: "column", gap: 7, color: "#41554a", fontSize: 12, fontWeight: 800 }}>
          Contraseña
          <input name="password" type="password" required autoFocus autoComplete="current-password" style={{ border: "1px solid #d6e3d9", borderRadius: 11, padding: "10px 11px", fontSize: 14 }} />
        </label>
        {error && <p role="alert" style={{ color: "#9f1239", fontSize: 13, marginTop: 12 }}>{error}</p>}
        <button type="submit" style={{ marginTop: 18, width: "100%", border: "1px solid #245c3a", background: "#245c3a", color: "#ffffff", borderRadius: 11, padding: "11px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Ingresar</button>
      </form>
    </main>
  )
}

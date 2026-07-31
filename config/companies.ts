import type { CompanyConfig, CompanyKey } from "@/types/dashboard"

// Configuración editable de alias para identificar cada empresa.
// No depende únicamente del prefijo del territorio: centraliza todas las reglas aquí.
export const COMPANY_CONFIGS: CompanyConfig[] = [
  {
    key: "perez-cardona",
    name: "Pérez y Cardona",
    shortName: "Pérez y Cardona",
    logo: "/logos/perez-cardona.png",
    aliases: ["perez y cardona", "perezycardona", "pyc"],
    territoryPrefixes: ["PYC"],
  },
  {
    key: "galagro",
    name: "Galagro",
    shortName: "Galagro",
    logo: "/logos/galagro.png",
    aliases: ["galagro"],
    territoryPrefixes: ["GALAGRO"],
  },
  {
    key: "tierragro",
    name: "Tierragro",
    shortName: "Tierragro",
    logo: "/logos/tierragro.png",
    aliases: ["tierragro"],
    territoryPrefixes: ["TIERRAGRO", "TGR"],
  },
]

export const COMPANY_MAP: Record<CompanyKey, CompanyConfig> = COMPANY_CONFIGS.reduce(
  (acc, c) => {
    acc[c.key] = c
    return acc
  },
  {} as Record<CompanyKey, CompanyConfig>,
)

export const COMPANY_ORDER: CompanyKey[] = ["perez-cardona", "galagro", "tierragro"]

/** Nombre legible de una empresa (o etiqueta neutra si no está clasificada). */
export function getCompanyName(key: CompanyKey | null): string {
  if (!key) return "Sin clasificar"
  return COMPANY_MAP[key]?.name ?? key
}

/** Logo de una empresa (o null si no aplica). */
export function getCompanyLogo(key: CompanyKey | null): string | null {
  if (!key) return null
  return COMPANY_MAP[key]?.logo ?? null
}

/** Quita acentos, colapsa espacios y pasa a minúsculas para comparar de forma robusta. */
export function canonical(text: unknown): string {
  if (text === null || text === undefined) return ""
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * Identifica la empresa a partir de textos disponibles (empresa, territorio,
 * organización de ventas, cargo, etc.). Devuelve null si no puede clasificarse.
 */
export function resolveCompany(...texts: (string | null | undefined)[]): CompanyKey | null {
  const joined = texts.map(canonical).filter(Boolean)
  if (joined.length === 0) return null

  for (const config of COMPANY_CONFIGS) {
    for (const value of joined) {
      // Coincidencia por alias.
      if (config.aliases.some((alias) => value.includes(canonical(alias)))) {
        return config.key
      }
      // Coincidencia por prefijo de territorio.
      if (
        config.territoryPrefixes.some((prefix) => {
          const p = canonical(prefix)
          return value.startsWith(p + " ") || value === p || value.startsWith(p)
        })
      ) {
        return config.key
      }
    }
  }
  return null
}

import type { StoredLoad as BaseStoredLoad } from "@/lib/agricola-q3/store"

export type StoredLoad = BaseStoredLoad & { rosterOverrides?: { activeAliases: string[]; directorName: string } }

// Almacenamiento aislado: no lee ni modifica los datos de Agrícola Antioquia.
const STORAGE_KEY = "c4c-galagro-antioquia-q3-v1"

export function saveLoad(load: StoredLoad) {
  if (load.year !== 2026 || load.quarter !== "Q3") throw new Error("Periodo Galagro Q3 inválido")
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(load))
}

export function readLoad(): StoredLoad | null {
  try {
    const content = window.sessionStorage.getItem(STORAGE_KEY)
    if (!content) return null
    const load = JSON.parse(content) as StoredLoad
    return load.year === 2026 && load.quarter === "Q3" ? load : null
  } catch { return null }
}

export function clearLoad() { window.sessionStorage.removeItem(STORAGE_KEY) }

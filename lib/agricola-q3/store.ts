import type { PreparedBlock } from "@/lib/agricola-import.mjs"

// Prepared records live only in this browser tab (sessionStorage); nothing is sent to the server or written to the repository.
const STORAGE_KEY = "c4c-agricola-q3-v1"

export type StoredBlock = Pick<PreparedBlock, "records" | "issues" | "warnings" | "summary"> & { fileName: string | null }

export type StoredLoad = {
  savedAt: string
  year: number
  quarter: string
  blocks: Record<string, StoredBlock>
}

export function saveLoad(load: StoredLoad) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(load))
}

export function readLoad(): StoredLoad | null {
  try {
    const text = window.sessionStorage.getItem(STORAGE_KEY)
    return text ? (JSON.parse(text) as StoredLoad) : null
  } catch {
    return null
  }
}

export function clearLoad() {
  window.sessionStorage.removeItem(STORAGE_KEY)
}

export async function readWorkbookRows(file: File, sheetName?: string): Promise<unknown[][]> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
  const name = sheetName ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[name]
  if (!sheet) throw new Error("Hoja no encontrada en el archivo: " + name)
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: true })
}

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import dotenv from "dotenv"
import { google } from "googleapis"

dotenv.config({
  path: path.join(process.cwd(), ".env.local"),
})

const root = process.cwd()
const configPath = path.join(root, "data", "configuracion-c4c.json")
const sourcesDir = path.join(root, "data", "fuentes")

const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")

if (!folderId || !clientEmail || !privateKey) {
  console.log("")
  console.log("Google Drive todavía no está configurado.")
  console.log("")
  console.log("Variables requeridas:")
  console.log("  GOOGLE_DRIVE_FOLDER_ID")
  console.log("  GOOGLE_CLIENT_EMAIL")
  console.log("  GOOGLE_PRIVATE_KEY")
  console.log("")
  console.log("No se realizó ninguna operación en Drive.")
  process.exit(2)
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"))

const aliases = new Map([
  ["informe Q1 - Final(1).xlsx", "informe Q1 - Final.xlsx"],
  [
    "informe Q1 - Galagro Ant Final(1).xlsx",
    "informe Q1 - Galagro Ant Final.xlsx",
  ],
  [
    "informe Q1 - Galagro Nacional - Promotor(1).xlsx",
    "informe Q1 - Galagro Nacional - Promotor.xlsx",
  ],
])

const expectedFiles = [
  ...new Set(
    config.source_rows
      .map((row) => String(row[7] ?? "").trim())
      .filter(Boolean)
      .map((name) => aliases.get(name) ?? name),
  ),
]

const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
})

const drive = google.drive({
  version: "v3",
  auth,
})

console.log("Consultando carpeta de Google Drive...")

const response = await drive.files.list({
  q: `'${folderId}' in parents and trashed = false`,
  fields: "files(id,name,mimeType,size,modifiedTime)",
  pageSize: 100,
  orderBy: "name",
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
})

const files = response.data.files ?? []

console.log(`Archivos encontrados: ${files.length}`)

const filesByName = new Map()

for (const file of files) {
  if (!file.id || !file.name) continue

  if (filesByName.has(file.name)) {
    throw new Error(
      `Hay archivos duplicados con el nombre "${file.name}" en Drive.`,
    )
  }

  filesByName.set(file.name, file)
}

const missing = expectedFiles.filter(
  (fileName) => !filesByName.has(fileName),
)

console.log("")
console.log("Archivos requeridos:")

for (const fileName of expectedFiles) {
  console.log(
    `${filesByName.has(fileName) ? "?" : "?"} ${fileName}`,
  )
}

if (missing.length > 0) {
  console.log("")
  console.log(`Faltan ${missing.length} archivo(s).`)
  console.log("No se descargará nada para evitar datos incompletos.")
  process.exit(3)
}

fs.mkdirSync(sourcesDir, {
  recursive: true,
})

console.log("")
console.log("Descargando fuentes...")

for (const fileName of expectedFiles) {
  const file = filesByName.get(fileName)

  const response = await drive.files.get(
    {
      fileId: file.id,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  )

  const destination = path.join(sourcesDir, fileName)
  const temporary = `${destination}.tmp`
  const buffer = Buffer.from(response.data)

  fs.writeFileSync(temporary, buffer)
  fs.renameSync(temporary, destination)

  console.log(
    `? ${fileName} — ${Math.round(buffer.length / 1024)} KB`,
  )
}

console.log("")
console.log(`Sincronización completada: ${expectedFiles.length} archivos.`)

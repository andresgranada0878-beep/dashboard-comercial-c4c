export function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

// Excel copia filas como TSV, con comillas para celdas multilínea.
export function parsePastedTable(text) {
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  if (!input.trim()) return { headers: [], rows: [], errors: [] }
  const records = []
  let record = [], cell = "", quoted = false
  for (let i = 0; i < input.length; i++) {
    const character = input[i]
    if (character === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++ }
      else if (quoted || cell.length === 0) quoted = !quoted
      else cell += character
    } else if (!quoted && (character === "\t" || character === "\n")) {
      record.push(cell); cell = ""
      if (character === "\n") { records.push(record); record = [] }
    } else cell += character
  }
  record.push(cell)
  records.push(record)
  const populated = records.filter(row => row.some(value => value.trim()))
  const headers = (populated.shift() ?? []).map(value => value.trim())
  const errors = []
  if (quoted) errors.push("Hay una celda con comillas sin cerrar.")
  if (headers.some(value => !value)) errors.push("Hay encabezados vacíos.")
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) errors.push("Hay encabezados duplicados.")
  const rows = populated.map((values, index) => {
    if (values.length !== headers.length) errors.push(`Fila ${index + 2}: ${values.length} columnas; se esperaban ${headers.length}.`)
    return values
  })
  return { headers, rows, errors }
}

export const QUARTER_MONTHS = {
  Q1: ["Enero", "Febrero", "Marzo"],
  Q2: ["Abril", "Mayo", "Junio"],
  Q3: ["Julio", "Agosto", "Septiembre"],
  Q4: ["Octubre", "Noviembre", "Diciembre"],
}

export function validatePeriod(table, mapping, year, quarter) {
  const errors = [...table.errors]
  const months = QUARTER_MONTHS[quarter]
  if (!months) return [...errors, "Trimestre inválido."]
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Año inválido.")
  if (!table.rows.length) errors.push("La tabla no contiene registros.")
  if (!Number.isInteger(mapping.month) || !table.headers[mapping.month]) {
    errors.push("Selecciona la columna de mes.")
    return errors
  }
  const counts = new Map(months.map(month => [normalizeHeader(month), 0]))
  table.rows.forEach((row, index) => {
    const month = normalizeHeader(row[mapping.month])
    if (!counts.has(month)) errors.push(`Fila ${index + 2}: mes fuera de ${quarter} o formato no reconocido.`)
    else counts.set(month, counts.get(month) + 1)
    if (Number.isInteger(mapping.year) && String(row[mapping.year]).trim() !== String(year)) errors.push(`Fila ${index + 2}: año distinto a ${year}.`)
  })
  for (const [month, count] of counts) if (count === 0) errors.push(`No hay registros de ${month}; confirma si faltan datos o no hubo actividad.`)
  return errors
}

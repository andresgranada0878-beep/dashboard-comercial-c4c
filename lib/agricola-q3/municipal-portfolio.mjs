// Conciliación exclusiva en el navegador: sin enviar cuentas ni responsables al repositorio.
// La autoría histórica no determina titularidad; solo se usa la columna oficial J/K de la matriz.
const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
const has = (row, columns) => columns.every(name => row.some(value => norm(value) === norm(name)))

export function keyOfMunicipality(city, department) {
  const c = norm(city), d = norm(department)
  return c && d ? c + " | " + d : null
}

function asTable(matrix, required) {
  const rows = (matrix ?? []).filter(Array.isArray)
  const i = rows.findIndex(row => has(row, required))
  if (i < 0) return { error: "No se encontraron columnas: " + required.join(", "), records: [] }
  const names = rows[i].map(norm)
  const get = (row, header) => row[names.indexOf(norm(header))]
  return { records: rows.slice(i + 1).filter(row => row.some(value => String(value ?? "").trim())).map(row => ({ row, get: field => get(row, field) })) }
}

export function parseAccountExport(matrix) {
  const table = asTable(matrix, ["ID de cliente", "Ciudad", "Departamento", "CLIENTE VISITABLE"])
  if (table.error) return { accounts: [], issues: [table.error] }
  const accounts = [], issues = [], ids = new Set()
  for (const [index, record] of table.records.entries()) {
    const id = String(record.get("ID de cliente") ?? "").trim()
    if (!id) { issues.push("Cuenta sin ID, registro " + (index + 1)); continue }
    if (ids.has(id)) { issues.push("Cuenta duplicada: " + id); continue }
    ids.add(id)
    accounts.push({
      id,
      city: String(record.get("Ciudad") ?? "").trim(),
      department: String(record.get("Departamento") ?? "").trim(),
      key: keyOfMunicipality(record.get("Ciudad"), record.get("Departamento")),
      visitable: ["SI", "SÍ", "YES", "TRUE", "1"].includes(norm(record.get("CLIENTE VISITABLE"))),
    })
  }
  return { accounts, issues }
}

export function parseOfficialMunicipalities(matrix) {
  const table = asTable(matrix, ["Clave municipio / depto", "PROMOTOR OFICIAL (EDITAR)", "TERRITORIO OFICIAL (EDITAR)"])
  if (table.error) return { municipalities: [], issues: [table.error] }
  const municipalities = [], issues = [], keys = new Set()
  for (const record of table.records) {
    const key = keyOfMunicipality(record.get("Municipio"), record.get("Departamento"))
    if (!key) continue
    if (keys.has(key)) { issues.push("Municipio duplicado en matriz: " + key); continue }
    keys.add(key)
    const promoter = String(record.get("PROMOTOR OFICIAL (EDITAR)") ?? "").trim()
    const territory = String(record.get("TERRITORIO OFICIAL (EDITAR)") ?? "").trim()
    if (Boolean(promoter) !== Boolean(territory)) issues.push("Promotor/territorio incompletos en " + key)
    municipalities.push({ key, city: String(record.get("Municipio")).trim(), department: String(record.get("Departamento")).trim(), promoter, territory, assigned: Boolean(promoter && territory) })
  }
  return { municipalities, issues }
}

export function buildMunicipalPortfolio(accountsSource, mappingsSource) {
  const issues = [...accountsSource.issues, ...mappingsSource.issues]
  const byKey = new Map(mappingsSource.municipalities.map(item => [item.key, item]))
  const promoters = new Map(), municipalities = new Map()
  const summary = { accounts: 0, visitable: 0, assigned: 0, assignedVisitable: 0, pending: 0, pendingVisitable: 0, withoutCity: 0, withoutCityVisitable: 0, mappedMunicipalities: 0, totalMunicipalities: mappingsSource.municipalities.length, complete: false }
  for (const map of mappingsSource.municipalities) if (map.assigned) summary.mappedMunicipalities++
  for (const account of accountsSource.accounts) {
    summary.accounts++
    if (account.visitable) summary.visitable++
    const map = account.key ? byKey.get(account.key) : null
    const assigned = map?.assigned && !issues.some(issue => issue.includes(account.key)) 
    if (assigned) {
      summary.assigned++
      if (account.visitable) summary.assignedVisitable++
      const nameKey = norm(map.promoter)
      const person = promoters.get(nameKey) ?? { promoter: map.promoter, territory: map.territory, accounts: 0, visitable: 0, cities: new Set() }
      person.accounts++
      if (account.visitable) person.visitable++
      person.cities.add(account.key)
      promoters.set(nameKey, person)
    } else {
      if (!account.key) { summary.withoutCity++; if (account.visitable) summary.withoutCityVisitable++ }
      else { summary.pending++; if (account.visitable) summary.pendingVisitable++ }
      const key = account.key ?? "SIN MUNICIPIO / DEPARTAMENTO"
      const pending = municipalities.get(key) ?? { municipality: account.city || "—", department: account.department || "—", accounts: 0, visitable: 0, reason: map ? "Sin promotor/territorio confirmado" : account.key ? "Municipio no incluido en la matriz" : "Ciudad/departamento sin identificar" }
      pending.accounts++
      if (account.visitable) pending.visitable++
      municipalities.set(key, pending)
    }
  }
  summary.complete = issues.length === 0 && summary.assignedVisitable === summary.visitable && summary.assigned === summary.accounts && summary.mappedMunicipalities === summary.totalMunicipalities
  return {
    summary, issues,
    promoters: [...promoters.values()].map(item => ({ ...item, municipalities: item.cities.size, cities: undefined })).sort((a, b) => a.promoter.localeCompare(b.promoter, "es")),
    pendingMunicipalities: [...municipalities.values()].sort((a, b) => b.visitable - a.visitable),
  }
}

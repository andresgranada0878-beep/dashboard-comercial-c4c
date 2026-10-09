import { normalizeHeader } from "../pasted-table.mjs"

const key = value => normalizeHeader(value)
const isNumber = value => typeof value === "number" && Number.isFinite(value)
const SOURCE_LABELS = {
  commercial: "Gestión comercial", promoters: "Gestión de promotores", technical: "Técnico",
  leads: "Leads", farms: "Fincas", activities: "Actividades de campo",
}

// Blank cells stay absent: a total exists only when at least one value exists.
export function sumField(rows, field) {
  let total = 0, present = 0, blanks = 0
  for (const row of rows) {
    const value = row[field]
    if (isNumber(value)) { total += value; present++ } else blanks++
  }
  return { value: present ? total : null, present, blanks }
}

export function evaluateRatio({ actual, target, cap, weight }) {
  if (actual === null || actual === undefined) return { rawCompliance: null, recognizedCompliance: null, contribution: null, status: "sin_dato" }
  if (target === null || target === undefined || target === 0) return { rawCompliance: null, recognizedCompliance: null, contribution: null, status: "sin_meta" }
  const rawCompliance = actual / target
  const recognizedCompliance = Math.max(0, cap === null || cap === undefined ? rawCompliance : Math.min(rawCompliance, cap))
  return { rawCompliance, recognizedCompliance, contribution: recognizedCompliance * weight, status: "ok" }
}

function addValues(values) {
  const present = values.filter(isNumber)
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null
}

function uniqueTerritories(rows) {
  return [...new Set(rows.map(row => row.Territorio))]
}

function formatList(values) {
  return values.filter(Boolean).join(", ")
}

const SMALL_WORDS = new Set(["de", "del", "la", "y"])
const CARGOS = { Director: "Director", Comercial: "Representante técnico comercial", Promotor: "Promotor técnico" }
const PROFILE_ORDER = { Director: 0, Comercial: 1, Promotor: 2 }

// People and territories come from the loaded exports so no roster is stored in the repository.
export function deriveCatalog(blocks, config) {
  const rules = config.catalog
  const prefix = new RegExp(rules.territoryPrefix)
  const vacancy = new RegExp(rules.vacancyPattern)
  const shortKey = name => key(name).replace(prefix, "").trim()
  const labelOf = name => {
    const override = rules.territoryLabels?.[shortKey(name)]
    if (override) return override
    const words = String(name).trim().split(/\s+/)
    const skipped = (key(name).match(prefix)?.[0].trim().split(/\s+/).length) ?? 0
    return words.slice(skipped).map((word, index) => {
      const lower = word.toLocaleLowerCase("es")
      if (index > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.length === 1 ? lower.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1)
    }).join(" ")
  }
  const observations = []
  const territories = new Map()
  const addTerritory = name => {
    if (!name || !String(name).trim()) return
    const territoryKey = key(name)
    if (!territories.has(territoryKey)) {
      territories.set(territoryKey, { name: String(name).trim(), label: labelOf(name), operating: !rules.nonOperatingTerritories.includes(shortKey(name)) })
    }
  }
  const people = new Map()
  const pushUnique = (list, territory) => { if (!list.some(item => key(item) === key(territory))) list.push(String(territory).trim()) }
  // A territory is assigned when the person's row carries a target; rows without one are visits made elsewhere.
  const addPerson = (row, profile, source, targetField) => {
    const name = String(row.Empleado ?? "").trim()
    if (!name) return
    addTerritory(row.Territorio)
    const personKey = key(name)
    let person = people.get(personKey)
    if (!person) {
      person = { name, key: personKey, profile, assigned: [], visited: [], sources: [source] }
      people.set(personKey, person)
    } else if (!person.sources.includes(source)) {
      person.sources.push(source)
      observations.push(`${name} aparece en ${person.sources.join(" y ")}; se evalúa como ${person.profile}.`)
    }
    if (!row.Territorio) return
    pushUnique(isNumber(row[targetField]) ? person.assigned : person.visited, row.Territorio)
  }
  for (const row of blocks.commercial?.records ?? []) addPerson(row, "Comercial", "Gestión comercial", "Meta Cobertura y Visitas")
  for (const row of blocks.promoters?.records ?? []) addPerson(row, "Promotor", "Gestión de promotores", "Meta Cobertura")
  for (const row of blocks.technical?.records ?? []) addTerritory(row.Territorio)

  const byLabel = (a, b) => labelOf(a).localeCompare(labelOf(b), "es")
  const list = [...people.values()].map(person => {
    const assigned = person.assigned.length ? person.assigned : person.visited
    if (!person.assigned.length) observations.push(`${person.name} no tiene meta en ningún territorio; se asignan los territorios donde registra filas.`)
    const otherTerritories = person.visited.filter(territory => !assigned.some(item => key(item) === key(territory))).sort(byLabel)
    const nonOperating = assigned.filter(territory => territories.get(key(territory)) && !territories.get(key(territory)).operating)
    const profile = person.profile === "Comercial" && nonOperating.length ? "Director" : person.profile
    if (profile === "Director" && nonOperating.length < assigned.length) observations.push(`${person.name} tiene meta en Dirección y en territorios operativos; se evalúa como director.`)
    const status = vacancy.test(person.key) ? "vacante" : /[A-ZÁÉÍÓÚÑ]/.test(person.name) && person.name === person.name.toLocaleUpperCase("es") ? "sin_titular" : "activo"
    return { name: person.name, key: person.key, profile, cargo: CARGOS[profile], territories: [...assigned].sort(byLabel), otherTerritories, status }
  }).sort((a, b) => PROFILE_ORDER[a.profile] - PROFILE_ORDER[b.profile] || a.name.localeCompare(b.name, "es"))
  const directors = list.filter(person => person.profile === "Director")
  if (directors.length !== 1) observations.push(directors.length ? `Se identificaron ${directors.length} personas con filas de Dirección en Gestión comercial.` : "No se identificó director: Gestión comercial no trae filas del territorio Dirección.")
  return {
    people: list,
    territories: [...territories.values()].sort((a, b) => Number(b.operating) - Number(a.operating) || a.label.localeCompare(b.label, "es")),
    observations,
  }
}

export function buildAgricolaReports({ blocks, config }) {
  const months = config.months
  const quarter = config.quarter
  const periods = [...months, quarter]
  const indicatorConfig = new Map(config.indicators.map(indicator => [indicator.id, indicator]))
  const catalog = deriveCatalog(blocks, config)
  const people = catalog.people
  const peopleByKey = new Map(people.map(person => [person.key, person]))
  const operating = catalog.territories.filter(territory => territory.operating).map(territory => territory.name)
  const territoryLabel = new Map(catalog.territories.map(territory => [key(territory.name), territory.label]))
  const records = id => blocks[id]?.records ?? []
  const commercial = records("commercial"), promoters = records("promoters"), technical = records("technical")
  const leads = records("leads"), farms = records("farms"), activities = records("activities")
  const inScope = (territories, value) => territories.some(territory => key(territory) === key(value))
  const byMonth = (rows, month, field = "Mes") => rows.filter(row => key(row[field]) === key(month))
  const monthOfActivity = record => months[(record.month - 1) % 3]
  const globalObservations = [...catalog.observations]

  const promoterPositions = people.filter(person => person.profile === "Promotor" && (config.targets.includeVacantPositions || person.status === "activo"))
  const promotersFor = territories => promoterPositions.filter(person => person.territories.some(territory => inScope(territories, territory)))
  const perPromoter = config.targets.perPromoter

  // ---------- measures: each returns { formula, source, scope, months: {m: {actual,target,partial,notes}}, quarter: {...}, notes } ----------

  function personalRows(rows, person) {
    return rows.filter(row => key(row.Empleado) === person.key)
  }

  function visitsMeasure(entity) {
    const notes = []
    if (entity.kind === "territorio") {
      const rows = commercial.filter(row => inScope(entity.territories, row.Territorio))
      return countVsTarget(rows, "Cant. Visitas", monthRows => addValues(monthRows.map(row => row["Meta Cobertura y Visitas"])), {
        source: "commercial", scope: "Filas de Gestión comercial del territorio (todas las personas, incluido el director)",
        formula: "Σ Cant. Visitas del territorio / Σ Meta Cobertura y Visitas mensual del territorio", notes,
      })
    }
    const isPromoter = entity.profile === "Promotor"
    const rows = personalRows(isPromoter ? promoters : commercial, entity.person)
    const outside = uniqueTerritories(rows).filter(territory => !inScope(entity.territories, territory))
    if (outside.length) notes.push("Incluye visitas registradas en otros territorios: " + formatList(outside.map(territory => territoryLabel.get(key(territory)) ?? territory)))
    if (entity.kind === "direccion") {
      const monthly = config.targets.director.visitsPerMonth
      return countVsTarget(rows, "Cant. Visitas", () => monthly ?? null, {
        source: "commercial", scope: "Visitas personales del director en todos los territorios",
        formula: `Σ Cant. Visitas / (${monthly ?? "meta sin definir"} visitas mensuales × meses)`,
        notes: [...notes, "La meta de 1 visita del territorio Dirección en el exportado se ignora; se usa la meta configurada (pendiente de validación)."],
      })
    }
    if (isPromoter) {
      return countVsTarget(rows, "Cant. Visitas", monthRows => {
        const values = [...new Set(monthRows.map(row => row["Meta Visitas"]).filter(isNumber))]
        if (values.length > 1) notes.push("La meta de visitas difiere entre territorios en un mismo mes; se usa la mayor.")
        return values.length ? Math.max(...values) : null
      }, { source: "promoters", scope: "Filas personales en Gestión de promotores", formula: "Σ Cant. Visitas / Σ Meta Visitas mensual (personal, repetida por territorio)", notes })
    }
    return countVsTarget(rows, "Cant. Visitas", monthRows => addValues(monthRows.map(row => row["Meta Cobertura y Visitas"])), {
      source: "commercial", scope: "Filas personales en Gestión comercial (todas las filas del empleado)",
      formula: "Σ Cant. Visitas / Σ Meta Cobertura y Visitas de sus territorios por mes (columna auxiliar METAVISITAS)", notes,
    })
  }

  function coverageMeasure(entity) {
    const notes = []
    if (entity.kind === "territorio") {
      const rows = commercial.filter(row => inScope(entity.territories, row.Territorio))
      return countVsTarget(rows, "Clientes Visitados", monthRows => addValues(monthRows.map(row => row["Meta Cobertura y Visitas"])), {
        source: "commercial", scope: "Filas de Gestión comercial del territorio",
        formula: "Σ Clientes Visitados / Σ Meta Cobertura y Visitas mensual (promedio mensual del periodo)", notes,
      })
    }
    const isPromoter = entity.profile === "Promotor"
    const rows = personalRows(isPromoter ? promoters : commercial, entity.person)
    if (entity.kind === "direccion") {
      const monthly = config.targets.director.coveragePerMonth
      return countVsTarget(rows, "Clientes Visitados", () => monthly ?? null, {
        source: "commercial", scope: "Clientes visitados por el director",
        formula: "Σ Clientes Visitados / meta mensual configurada × meses",
        notes: ["El exportado Q3 trae meta 1 en Dirección; la plantilla Q1 usaba todos los clientes / 12. Meta sin definir: pendiente de validación."],
      })
    }
    if (isPromoter) {
      const shared = entity.territories.map(territory => promoterPositions.filter(person => inScope(person.territories, territory)).length)
      if (shared.some(count => count > 1)) notes.push("La meta de cobertura del exportado es del territorio y se repite en cada promotor.")
      return countVsTarget(rows, "Clientes Visitados", monthRows => {
        const perTerritory = uniqueTerritories(monthRows).map(territory => {
          const values = monthRows.filter(row => row.Territorio === territory).map(row => row["Meta Cobertura"]).filter(isNumber)
          return values.length ? Math.max(...values) : null
        })
        return addValues(perTerritory)
      }, { source: "promoters", scope: "Filas personales en Gestión de promotores", formula: "Σ Clientes Visitados / Σ Meta Cobertura mensual de sus territorios", notes })
    }
    return countVsTarget(rows, "Clientes Visitados", monthRows => addValues(monthRows.map(row => row["Meta Cobertura y Visitas"])), {
      source: "commercial", scope: "Filas personales en Gestión comercial", formula: "Σ Clientes Visitados / Σ Meta Cobertura y Visitas mensual", notes,
    })
  }

  function countVsTarget(rows, field, monthlyTarget, { source, scope, formula, notes }) {
    const result = { source, scope, formula, notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const total = sumField(monthRows, field)
      const target = monthlyTarget(monthRows, month)
      result.months[month] = { actual: total.value, target, partial: total.value !== null && total.blanks > 0, notes: total.blanks && monthRows.length ? [`${total.blanks} de ${monthRows.length} filas sin ${field}`] : [] }
      actuals.push(total.value); targets.push(target)
    }
    const actual = addValues(actuals)
    result.quarter = {
      actual, target: addValues(targets),
      partial: actual !== null && (actuals.some(value => value === null) || Object.values(result.months).some(month => month.partial)),
      notes: actuals.some(value => value === null) && actual !== null ? ["Meses sin dato: " + months.filter((_, index) => actuals[index] === null).join(", ")] : [],
    }
    return result
  }

  function newClientsMeasure(entity) {
    const notes = ["El exportado repite el acumulado del trimestre en cada mes; el resultado mensual muestra el acumulado del trimestre."]
    if (entity.profile === "Promotor" && entity.kind === "individual") {
      const rows = personalRows(promoters, entity.person)
      notes.push("La cantidad de clientes nuevos es del territorio y se repite para cada promotor del territorio.")
      const monthValue = month => {
        const monthRows = byMonth(rows, month)
        return addValues(uniqueTerritories(monthRows).map(territory => {
          const values = monthRows.filter(row => row.Territorio === territory).map(row => row["Cant. Clientes Nuevos"]).filter(isNumber)
          return values.length ? Math.max(...values) : null
        }))
      }
      const monthTarget = month => {
        const values = byMonth(rows, month).map(row => row["Meta Clientes Nuevos"]).filter(isNumber)
        return values.length ? Math.max(...values) : null
      }
      return cumulative(months.map(monthValue), addValues(months.map(monthTarget)), {
        source: "promoters", scope: "Valor territorial repetido en las filas del promotor",
        formula: "Máximo acumulado de Cant. Clientes Nuevos / Σ Meta Clientes Nuevos mensual (10 por mes)", notes,
      })
    }
    let rows, scope
    if (entity.kind === "individual") { rows = personalRows(commercial, entity.person); scope = "Filas personales en Gestión comercial" }
    else if (entity.kind === "territorio") { rows = commercial.filter(row => inScope(entity.territories, row.Territorio)); scope = "Filas de Gestión comercial del territorio" }
    else { rows = commercial.filter(row => inScope(operating, row.Territorio)); scope = "Consolidado de Gestión comercial de los territorios operativos" }
    const values = months.map(month => addValues(byMonth(rows, month).map(row => row["Cant. Clientes Nuevos"])))
    const annual = new Map()
    for (const row of rows) {
      if (!isNumber(row["Meta Clientes Recuperar"])) continue
      const identity = key(row.Territorio) + "|" + key(row.Empleado)
      const previous = annual.get(identity)
      if (previous !== undefined && previous !== row["Meta Clientes Recuperar"]) notes.push(`La meta anual de ${row.Empleado} en ${row.Territorio} cambia entre meses; se usa la mayor.`)
      annual.set(identity, Math.max(previous ?? 0, row["Meta Clientes Recuperar"]))
    }
    const annualTotal = addValues([...annual.values()])
    return cumulative(values, annualTotal === null ? null : Math.ceil(annualTotal / 4), {
      source: "commercial", scope,
      formula: "Máximo acumulado de Cant. Clientes Nuevos / REDONDEAR.MAS(Σ Meta Clientes Recuperar anual / 4)", notes,
    })
  }

  function cumulative(monthValues, quarterTarget, { source, scope, formula, notes }) {
    const present = monthValues.filter(isNumber)
    const actual = present.length ? Math.max(...present) : null
    if (new Set(present).size > 1) notes.push("El acumulado cambia entre meses; se toma el mayor.")
    const result = { source, scope, formula, notes, months: {} }
    for (const month of months) result.months[month] = { actual, target: quarterTarget, partial: false, notes: [] }
    result.quarter = { actual, target: quarterTarget, partial: actual !== null && present.length < months.length, notes: [] }
    return result
  }

  function technicalScope(entity) {
    if (entity.kind === "direccion") return operating
    return entity.territories
  }

  function recommendationsMeasure(entity) {
    const territories = technicalScope(entity)
    const rows = technical.filter(row => inScope(territories, row.Territorio))
    const notes = []
    const result = { source: "technical", scope: "Territorios: " + formatList(territories.map(territory => territoryLabel.get(key(territory)) ?? territory)), formula: "Σ Valor Recomendaciones / Σ Ppto", notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const value = sumField(monthRows, "Valor Recomendaciones"), budget = sumField(monthRows, "Ppto")
      const monthNotes = []
      if (value.blanks) monthNotes.push(`${value.blanks} de ${monthRows.length} grupos sin Valor Recomendaciones (vacío conservado)`)
      if (budget.blanks) monthNotes.push(`${budget.blanks} de ${monthRows.length} grupos sin Ppto`)
      result.months[month] = { actual: value.value, target: budget.value, partial: value.value !== null && value.blanks > 0, notes: monthNotes }
      actuals.push(value.value); targets.push(budget.value)
    }
    const actual = addValues(actuals)
    result.quarter = { actual, target: addValues(targets), partial: actual !== null && Object.values(result.months).some(month => month.partial || month.actual === null), notes: [] }
    if (actual === null) notes.push("Todos los valores de recomendaciones del alcance están vacíos en el exportado: sin dato.")
    return result
  }

  function referencesMeasure(entity) {
    const territories = technicalScope(entity)
    const rows = technical.filter(row => inScope(territories, row.Territorio))
    const notes = ["Una referencia recomendada en varios meses se cuenta en cada mes (el exportado no trae el código)."]
    const result = { source: "technical", scope: "Territorios: " + formatList(territories.map(territory => territoryLabel.get(key(territory)) ?? territory)), formula: "Σ (Meta Referencias × Referencias Recomendadas) de los meses / portafolio mensual (Σ Meta Referencias del mes)", notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const count = sumField(monthRows, "Cantidad referencias"), portfolio = sumField(monthRows, "Meta Referencias")
      result.months[month] = { actual: count.value, target: portfolio.value, partial: count.value !== null && count.blanks > 0, notes: count.blanks ? [`${count.blanks} de ${monthRows.length} grupos sin referencias (vacío conservado)`] : [] }
      actuals.push(count.value); targets.push(portfolio.value)
    }
    const actual = addValues(actuals)
    const presentTargets = targets.filter(isNumber)
    result.quarter = { actual, target: presentTargets.length ? addValues(presentTargets) / presentTargets.length : null, partial: actual !== null && Object.values(result.months).some(month => month.partial || month.actual === null), notes: [] }
    if (actual === null) notes.push("Todas las referencias del alcance están vacías en el exportado: sin dato.")
    return result
  }

  function leadsFor(person) {
    const rows = leads.filter(row => key(row.Empleado) === person.key)
    return months.map(month => {
      const monthRows = byMonth(rows, month)
      if (!monthRows.length) return null
      const generated = sumField(monthRows, "Meta Leads").value
      const pct = monthRows.map(row => row["Leads calificados"])
      const qualified = pct.every(value => value === null) ? null : monthRows.reduce((sum, row) => sum + Math.round((row["Leads calificados"] ?? 0) * (row["Meta Leads"] ?? 0)), 0)
      const onTime = sumField(monthRows, "Calificados Oportunos").value
      const late = sumField(monthRows, "Fuera de Tiempo").value
      const pending = sumField(monthRows, "Pendientes").value
      return { generated, qualified, onTime, late, pending }
    })
  }

  function leadsMeasure(entity, field) {
    const members = entity.kind === "territorio"
      ? people.filter(person => person.profile !== "Director" && person.territories.some(territory => inScope(entity.territories, territory)))
      : [entity.person]
    const absentAsZero = config.policies.leadsAbsentEmployee === "cero"
    const historical = config.policies.leadsQualifiedNumerator === "meta_leads_historico"
    const notes = []
    const perMember = members.map(member => ({ member, values: leadsFor(member) }))
    const absent = perMember.filter(item => item.values.every(value => value === null)).map(item => item.member.name)
    if (absent.length) notes.push((absentAsZero ? "Sin registros en Leads (se asumen 0): " : "Sin registros en Leads; la ausencia no demuestra incumplimiento y no se evalúa: ") + absent.join(", "))
    const numerator = value => field === "onTime" ? value.onTime ?? 0 : historical ? value.generated ?? 0 : value.qualified
    const result = {
      source: "leads", scope: entity.kind === "territorio" ? "Personas con territorio principal en el territorio: " + members.map(member => member.name).join(", ") : "Registros personales en Leads",
      formula: field === "onTime" ? "Σ Calificados Oportunos / Σ máximo(1, Meta Leads) por mes evaluado" : historical ? "Σ Meta Leads / Σ máximo(1, Meta Leads) por mes (regla de las plantillas)" : "Σ (Leads calificados % × Meta Leads) / Σ máximo(1, Meta Leads) por mes evaluado",
      notes, months: {},
    }
    let quarterActual = null, quarterTarget = 0, partial = false, evaluatedMonths = 0
    for (const [index, month] of months.entries()) {
      let actual = null, target = 0, monthPartial = false
      const monthNotes = []
      for (const { values } of perMember) {
        const value = values[index]
        if (!value) { if (absentAsZero) { actual = (actual ?? 0); target += 1 } else monthPartial = monthPartial || members.length > 1; continue }
        const numeratorValue = numerator(value)
        if (numeratorValue === null) { monthPartial = true; monthNotes.push("Registro sin «Leads calificados»") ; target += Math.max(1, value.generated ?? 0); continue }
        actual = (actual ?? 0) + numeratorValue
        target += Math.max(1, value.generated ?? 0)
        if (!historical && field !== "onTime" && value.generated !== null) monthNotes.push(`Generados ${value.generated}; calificados ${value.qualified ?? "vacío"}; oportunos ${value.onTime ?? 0}; fuera de tiempo ${value.late ?? 0}; pendientes ${value.pending ?? 0}`)
      }
      const anyRecord = perMember.some(({ values }) => values[index])
      if (!anyRecord && !absentAsZero) { result.months[month] = { actual: null, target: null, partial: false, notes: ["Sin registros en el mes"] }; partial = true; continue }
      result.months[month] = { actual, target: target || null, partial: monthPartial, notes: monthNotes }
      if (actual !== null) { quarterActual = (quarterActual ?? 0) + actual; evaluatedMonths++ }
      quarterTarget += target
      partial = partial || monthPartial
    }
    result.quarter = { actual: quarterActual, target: quarterTarget || null, partial: quarterActual !== null && partial, notes: quarterActual !== null && evaluatedMonths < months.length ? [`Evaluado sobre ${evaluatedMonths} de ${months.length} meses con registros`] : [] }
    return result
  }

  function promoterCount(entity) {
    if (entity.kind === "direccion") return promoterPositions.length
    if (entity.kind === "individual" && entity.profile === "Promotor") return 1
    return promotersFor(entity.territories).length
  }

  function targetNote(entity) {
    const count = promoterCount(entity)
    if (entity.kind === "individual" && entity.profile === "Promotor") return "Meta por promotor"
    return `Meta = ${count} posiciones de promotor${config.targets.includeVacantPositions ? " (incluye vacantes)" : ""}: ${promotersFor(entity.kind === "direccion" ? operating : entity.territories).map(person => person.name).join(", ") || "ninguna"}`
  }

  function activitiesMeasure(entity) {
    const scopeAll = entity.kind === "direccion"
    const rows = scopeAll ? activities : activities.filter(row => inScope(entity.territories, row["Territorio de ventas"]))
    const perQuarter = promoterCount(entity) * (perPromoter.activitiesPerQuarter + perPromoter.plotsPerQuarter)
    const notes = [targetNote(entity)]
    if (entity.kind === "individual") {
      const own = activities.filter(row => key(row.Propietario) === entity.person.key).length
      notes.push(`Referencia: ${own} actividades válidas registradas a su nombre en Agrícola (no se usan en el cálculo).`)
    }
    const result = { source: "activities", scope: scopeAll ? "Todas las actividades válidas de Agrícola Antioquia" : "Actividades válidas del territorio de ventas", formula: "Conteo de ID válidos / meta trimestral (3 por promotor; mensual = trimestral / 3)", notes, months: {} }
    for (const month of months) result.months[month] = { actual: rows.filter(row => monthOfActivity(row) === month).length, target: perQuarter ? perQuarter / months.length : null, partial: false, notes: [] }
    result.quarter = { actual: rows.length, target: perQuarter || null, partial: false, notes: [] }
    return result
  }

  function farmsMeasure(entity, kind) {
    const scopeAll = entity.kind === "direccion"
    const rows = farms.filter(row => inScope(scopeAll ? operating : entity.territories, row.des_territorio))
    const monthlyTarget = promoterCount(entity) * (kind === "hectares" ? perPromoter.hectaresPerMonth : perPromoter.cropsPerMonth)
    const notes = [targetNote(entity), kind === "hectares" ? "La suma mensual no representa fincas únicas." : "Cuenta registros cultivo × empleado × mes; no son cultivos únicos."]
    if (!rows.length) notes.push(config.policies.farmsWithoutRecords === "cero" ? "Sin registros en Fincas para el alcance: se toma 0." : "Sin registros en Fincas: sin dato.")
    const result = { source: "farms", scope: scopeAll ? "Fincas de los territorios operativos" : "Fincas del territorio", formula: kind === "hectares" ? "Σ Héctareas / (30 ha × promotores × meses)" : "Registros con cultivo / (1 × promotores × meses)", notes, months: {} }
    const zero = config.policies.farmsWithoutRecords === "cero" ? 0 : null
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const actual = kind === "hectares" ? (monthRows.length ? sumField(monthRows, "Héctareas").value : zero) : (monthRows.length ? monthRows.filter(row => String(row.atr_cultivo_texto ?? "").trim()).length : zero)
      result.months[month] = { actual, target: monthlyTarget || null, partial: false, notes: [] }
    }
    const actual = addValues(months.map(month => result.months[month].actual))
    result.quarter = { actual, target: monthlyTarget ? monthlyTarget * months.length : null, partial: false, notes: [] }
    return result
  }

  // ---------- assembly ----------

  function buildIndicator(id, measure, entity) {
    const definition = indicatorConfig.get(id)
    const indicator = {
      id, label: definition.label, weight: definition.weight, cap: definition.cap, calculationType: definition.calculationType,
      criterion: definition.criterion, pending: definition.pending, formula: measure.formula,
      source: SOURCE_LABELS[measure.source] ?? measure.source, scope: measure.scope, notes: [...new Set(measure.notes)], periods: {},
    }
    for (const period of periods) {
      const value = period === quarter ? measure.quarter : measure.months[period]
      const evaluation = evaluateRatio({ actual: value.actual, target: value.target, cap: definition.cap, weight: definition.weight })
      indicator.periods[period] = { actual: value.actual, target: value.target, ...evaluation, status: evaluation.status === "ok" && value.partial ? "parcial" : evaluation.status, notes: value.notes }
    }
    return indicator
  }

  function cropManagement(indicators) {
    const definition = indicatorConfig.get("gestion-cultivos-impactados")
    const hectares = indicators.find(indicator => indicator.id === "hectareas"), crops = indicators.find(indicator => indicator.id === "cultivos")
    const indicator = { id: definition.id, label: definition.label, weight: 0, cap: definition.cap, calculationType: definition.calculationType, criterion: definition.criterion, pending: [], formula: "(Hectáreas + Cultivos) / 2", source: "Fincas", scope: "Derivado", notes: [], periods: {} }
    for (const period of periods) {
      const a = hectares.periods[period].recognizedCompliance, b = crops.periods[period].recognizedCompliance
      const value = a === null || b === null ? null : (a + b) / 2
      indicator.periods[period] = { actual: null, target: null, rawCompliance: value, recognizedCompliance: value, contribution: 0, status: value === null ? "sin_dato" : "ok", notes: [] }
    }
    return indicator
  }

  function summarize(indicators) {
    const results = {}
    const weighted = indicators.filter(indicator => indicator.weight > 0)
    const totalWeight = weighted.reduce((sum, indicator) => sum + indicator.weight, 0)
    for (const period of periods) {
      const evaluated = weighted.filter(indicator => indicator.periods[period].recognizedCompliance !== null)
      const evaluatedWeight = evaluated.reduce((sum, indicator) => sum + indicator.weight, 0)
      const result = evaluated.length ? evaluated.reduce((sum, indicator) => sum + indicator.periods[period].contribution, 0) : null
      const partial = weighted.some(indicator => indicator.periods[period].status === "parcial")
      results[period] = { result, evaluatedWeight, totalWeight, complete: Math.abs(evaluatedWeight - totalWeight) < 1e-9 && !partial, missing: weighted.filter(indicator => indicator.periods[period].recognizedCompliance === null).map(indicator => indicator.label) }
    }
    return results
  }

  function buildEntity(entity) {
    const indicators = [
      buildIndicator("ejecucion_visitas", visitsMeasure(entity), entity),
      buildIndicator("cobertura_clientes", coverageMeasure(entity), entity),
      buildIndicator("nuevos_clientes", newClientsMeasure(entity), entity),
      buildIndicator("recomendaciones", recommendationsMeasure(entity), entity),
      buildIndicator("referencias", referencesMeasure(entity), entity),
      buildIndicator("leads_calificados", leadsMeasure(entity, "qualified"), entity),
      buildIndicator("leads_calificados_tiempo", leadsMeasure(entity, "onTime"), entity),
      buildIndicator("actividades_campo", activitiesMeasure(entity), entity),
      buildIndicator("hectareas", farmsMeasure(entity, "hectares"), entity),
      buildIndicator("cultivos", farmsMeasure(entity, "crops"), entity),
    ]
    indicators.push(cropManagement(indicators))
    const results = summarize(indicators)
    const pendingRules = [...new Set(indicators.flatMap(indicator => indicator.pending))]
    if (entity.kind === "direccion") pendingRules.push("director-scope")
    const observations = []
    if (entity.status === "vacante") observations.push("Posición vacante: el resultado es informativo y no corresponde a la evaluación de una persona.")
    if (entity.status === "sin_titular") observations.push("Posición sin titular en el exportado: el resultado es informativo.")
    const draftReasons = []
    if (!config.rulesValidated) draftReasons.push("Reglas pendientes de validación")
    if (!results[quarter].complete) draftReasons.push("Indicadores sin dato o parciales en el trimestre")
    return {
      id: entity.id, kind: entity.kind, profile: entity.profile, name: entity.name, cargo: entity.cargo,
      territories: entity.territories, territoryLabel: formatList(entity.territories.map(territory => territoryLabel.get(key(territory)) ?? territory)),
      status: entity.status, indicators, results, pendingRules: [...new Set(pendingRules)], observations,
      reportState: draftReasons.length ? "borrador" : "final", draftReasons,
    }
  }

  const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const entities = []
  for (const person of people) {
    if (person.profile === "Director") {
      entities.push(buildEntity({ id: "direccion-" + slug(person.name), kind: "direccion", profile: "Director", name: person.name, cargo: person.cargo, territories: person.territories, status: person.status, person }))
    } else {
      entities.push(buildEntity({ id: "individual-" + slug(person.name), kind: "individual", profile: person.profile, name: person.name, cargo: person.cargo, territories: person.territories, status: person.status, person }))
    }
  }
  for (const territory of catalog.territories.filter(item => item.operating)) {
    entities.push(buildEntity({ id: "territorio-" + slug(territory.label), kind: "territorio", profile: "Territorio", name: territory.label, cargo: "Territorio " + territory.label, territories: [territory.name], status: "activo" }))
  }

  // ---------- catalog correspondence ----------
  const unmatched = new Map()
  const note = (name, source, profileHint) => {
    if (!name || !String(name).trim()) return
    const person = peopleByKey.get(key(name))
    if (!person) {
      const entry = unmatched.get(key(name)) ?? { name, sources: new Set(), count: 0 }
      entry.sources.add(source); entry.count++
      unmatched.set(key(name), entry)
    } else if (profileHint && person.profile !== profileHint && !(profileHint === "Comercial" && person.profile === "Director")) {
      globalObservations.push(`${person.name} aparece en ${source} pero su cargo en el catálogo es ${person.profile}.`)
    }
  }
  commercial.forEach(row => note(row.Empleado, "Gestión comercial", "Comercial"))
  promoters.forEach(row => note(row.Empleado, "Gestión de promotores", "Promotor"))
  leads.forEach(row => note(row.Empleado, "Leads"))
  farms.forEach(row => note(row.atr_desc_empleado, "Fincas"))
  activities.forEach(row => note(row.Propietario, "Actividades de campo"))
  const unknown = [...unmatched.values()].map(entry => ({ name: entry.name, sources: [...entry.sources], count: entry.count }))
  for (const entry of unknown) globalObservations.push(`Sin correspondencia en el catálogo: ${entry.name} (${entry.sources.join(", ")}, ${entry.count} registros). Sus registros cuentan en el territorio pero no tienen informe individual.`)
  const territoryNames = new Set(catalog.territories.map(territory => key(territory.name)))
  const unknownTerritories = [...new Set([...commercial, ...promoters, ...technical].map(row => row.Territorio).concat(farms.map(row => row.des_territorio), activities.map(row => row["Territorio de ventas"])).filter(value => value && !territoryNames.has(key(value))))]
  for (const territory of unknownTerritories) globalObservations.push(`Territorio no configurado: ${territory}. No se asigna a ningún informe territorial.`)
  const dirRows = technical.filter(row => !inScope(operating, row.Territorio))
  if (dirRows.length) {
    const withValues = dirRows.filter(row => isNumber(row["Valor Recomendaciones"]) || isNumber(row.Ppto) || isNumber(row["Referencias Recomendadas"])).length
    globalObservations.push(`Técnico: ${dirRows.length} filas de Dirección / Dirección Técnica; ${withValues} con recomendaciones, presupuesto o referencias. Se excluyen del consolidado porque solo repiten Meta Referencias.`)
  }

  return {
    version: config.version, report: config.report, company: config.company, year: config.year, quarter, months, periods,
    entities, territories: catalog.territories, unknownPeople: unknown, observations: globalObservations,
    pendingRules: config.pendingRules, rulesValidated: config.rulesValidated,
  }
}

// Controls are expected counts supplied by whoever holds the source files; they are not stored in the repository.
export function reconcile(blocks, controls) {
  const checks = []
  for (const [id, control] of Object.entries(controls ?? {})) {
    const summary = blocks[id]?.summary
    if (!summary) { checks.push({ block: id, check: "Bloque cargado", expected: "sí", actual: "no", ok: false }); continue }
    if (control.read !== undefined) checks.push({ block: id, check: "Registros leídos", expected: control.read, actual: summary.read, ok: summary.read === control.read })
    if (control.selected !== undefined) checks.push({ block: id, check: "Registros válidos", expected: control.selected, actual: summary.selected, ok: summary.selected === control.selected })
    for (const [month, value] of Object.entries(control.months ?? {})) checks.push({ block: id, check: "Registros " + month, expected: value, actual: summary.months?.[month] ?? 0, ok: (summary.months?.[month] ?? 0) === value })
    for (const [type, value] of Object.entries(control.byType ?? {})) checks.push({ block: id, check: type, expected: value, actual: summary.byType?.[type] ?? 0, ok: (summary.byType?.[type] ?? 0) === value })
  }
  return checks
}

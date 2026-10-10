import { normalizeHeader } from "../pasted-table.mjs"

const key = value => normalizeHeader(value)
const isNumber = value => typeof value === "number" && Number.isFinite(value)
const SOURCE_LABELS = {
  commercial: "Gestión comercial", promoters: "Gestión de promotores", technical: "Técnico",
  leads: "Leads", farms: "Fincas", activities: "Actividades de campo",
}

const NOT_APPLICABLE = { rawCompliance: null, recognizedCompliance: null, contribution: null, status: "no_aplica" }

// Q1/Q2 SUMIFS rule: a blank cell in an existing row counts as 0. Only the absence of rows gives no value.
export function sumField(rows, field) {
  let total = 0, present = 0, blanks = 0
  for (const row of rows) {
    const value = row[field]
    if (isNumber(value)) { total += value; present++ } else blanks++
  }
  return { value: rows.length ? total : null, present, blanks }
}

const BLANK_AS_ZERO = "vacío tratado como gestión 0 (regla SUMIFS Q1/Q2)"
const blankOnly = sum => sum.present === 0 && sum.blanks > 0
const DIRECTOR_REFERENCES_NOTE = "Corrección metodológica desde Q3; Q1/Q2 se conservan sin modificación por corresponder a resultados históricos publicados. Se aplica la metodología consolidada de los territorios: Σ REF CANTIDAD (Referencias Recomendadas × Meta Referencias, sin redondeo previo) de los territorios del alcance / (Σ Meta Referencias del mismo alcance y periodo / 3)."

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
  // Source territories stay separate; a group only joins them for evaluation.
  const groups = (rules.territoryGroups ?? []).map(group => ({
    label: group.label,
    members: [...territories.values()].filter(territory => territory.operating && group.members.includes(shortKey(territory.name))).map(territory => territory.name),
  })).filter(group => group.members.length > 1)
  return {
    people: list,
    territories: [...territories.values()].sort((a, b) => Number(b.operating) - Number(a.operating) || a.label.localeCompare(b.label, "es")),
    groups,
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
  const labelTerritories = territories => {
    const remaining = [...territories]
    const labels = []
    for (const group of catalog.groups) {
      if (group.members.every(member => inScope(remaining, member))) {
        labels.push(group.label)
        for (const member of group.members) remaining.splice(remaining.findIndex(item => key(item) === key(member)), 1)
      }
    }
    return formatList([...labels, ...remaining.map(territory => territoryLabel.get(key(territory)) ?? territory)])
  }

  // Field targets come from active promoters only; vacancies never generate one.
  const fieldTargets = config.targets.fieldTargets
  const activePromoters = people.filter(person => person.profile === "Promotor" && (person.status === "activo" || fieldTargets.vacanciesGenerateTarget))
  const activePromotersIn = territories => activePromoters.filter(person => person.territories.some(territory => inScope(territories, territory)))
  const units = catalog.groups.map(group => ({ label: group.label, territories: group.members }))
  for (const territory of catalog.territories.filter(item => item.operating)) {
    if (!catalog.groups.some(group => inScope(group.members, territory.name))) units.push({ label: territory.label, territories: [territory.name] })
  }
  units.sort((a, b) => a.label.localeCompare(b.label, "es"))

  function promotersForTarget(entity) {
    if (entity.kind === "direccion") return units.flatMap(unit => activePromotersIn(unit.territories))
    if (entity.kind === "individual" && entity.profile === "Promotor") return entity.status === "activo" || fieldTargets.vacanciesGenerateTarget ? [entity.person] : []
    return activePromotersIn(entity.territories)
  }
  const usesAssignedTerritory = entity => entity.kind === "individual" && entity.profile === "Comercial" && fieldTargets.commercialScope === "territorio_asignado"
  function fieldTarget(entity, perPromoter, unit) {
    const promoters = promotersForTarget(entity)
    const vacancies = entity.kind === "individual" && entity.profile === "Promotor"
      ? (entity.status === "activo" ? [] : [entity.person])
      : people.filter(person => person.profile === "Promotor" && person.status !== "activo" && person.territories.some(territory => inScope(entity.kind === "direccion" ? operating : entity.territories, territory)))
    const ownPosition = entity.kind === "individual" && entity.profile === "Promotor"
    const vacancyNote = vacancies.length && !ownPosition ? ` Sin meta para vacantes o posiciones sin titular: ${vacancies.map(person => person.name).join(", ")}.` : ""
    if (!promoters.length) return { value: null, note: (ownPosition ? `Posición vacante o sin titular: no genera meta (la regla es ${perPromoter} ${unit} por promotor activo).` : "Sin promotores activos asignados: no hay meta.") + vacancyNote }
    const value = promoters.length * perPromoter
    if (ownPosition) return { value, note: `Meta = ${perPromoter} ${unit} por promotor activo.` }
    if (entity.kind === "direccion") {
      const parts = units.map(item => `${item.label} ${activePromotersIn(item.territories).length * perPromoter}`)
      return { value, note: `Meta = suma de metas territoriales (${perPromoter} ${unit} × promotores activos de cada territorio): ${parts.join(" + ")} = ${value}.${vacancyNote}` }
    }
    const who = `${promoters.length} promotor${promoters.length > 1 ? "es" : ""} activo${promoters.length > 1 ? "s" : ""} (${promoters.map(person => person.name).join(", ")})`
    return { value, note: `Meta = ${perPromoter} ${unit} por promotor activo × ${who} = ${value}.${vacancyNote}` }
  }

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
    if (outside.length) notes.push("Incluye visitas registradas a su nombre en otros territorios: " + formatList(outside.map(territory => territoryLabel.get(key(territory)) ?? territory)))
    if (entity.kind === "direccion") {
      const monthly = config.targets.director.visitsPerMonth
      return countVsTarget(rows, "Cant. Visitas", () => monthly ?? null, {
        source: "commercial", scope: "Visitas personales del director en todos los territorios",
        formula: `Σ Cant. Visitas / (${monthly ?? "meta sin definir"} visitas mensuales × meses)`,
        notes: [...notes, `Meta de ${monthly} visitas mensuales según la metodología Q1/Q2; el valor 1 del territorio Dirección en el exportado Q3 no se usa como meta.`],
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
        formula: "Σ clientes únicos mensuales (Clientes Visitados) / Σ Meta Cobertura y Visitas mensual", notes: [...notes, "Un cliente gestionado en el mismo mes por dos personas del territorio puede contarse dos veces: el exportado no trae el código del cliente."],
      })
    }
    const isPromoter = entity.profile === "Promotor"
    const rows = personalRows(isPromoter ? promoters : commercial, entity.person)
    if (entity.kind === "direccion") {
      const universe = config.targets.director.coverageUniverse
      const monthly = universe ? universe / 12 : null
      return countVsTarget(rows, "Clientes Visitados", () => monthly, {
        source: "commercial", scope: "Clientes únicos gestionados por el director",
        formula: "Σ clientes únicos mensuales / (universo anual de clientes visitables / 12 × meses)",
        notes: [universe
          ? `Universo anual de clientes visitables del director = ${universe}, a cubrir una vez en el año: meta mensual = ${universe} / 12; meta trimestral = ${universe} / 12 × 3 = ${Math.round(universe / 4 * 100) / 100}. «Meta Cobertura y Visitas» = 1 de la fila Dirección no se usa como meta.`
          : "Sin meta. " + config.targets.director.coverageMissing],
      })
    }
    if (isPromoter) {
      const scope = "Filas personales en Gestión de promotores"
      const formula = "Σ clientes visitados personalmente / Σ meta individual mensual (Meta Cobertura del territorio / plazas de promotor asignadas al territorio)"
      if (entity.status !== "activo") {
        const notApplicable = { actual: null, target: null, partial: false, notApplicable: true, notes: ["Vacante o posición sin titular: cuenta como plaza en el divisor del territorio, pero no recibe cumplimiento (No aplica). Su parte de la meta no se redistribuye."] }
        return { source: "promoters", scope, formula, notes, months: Object.fromEntries(months.map(month => [month, notApplicable])), quarter: notApplicable }
      }
      // Plazas = titular promoters assigned to the territory + vacancies that carry a coverage target there in this quarter's export
      // (a vacancy without a target is residual). The export repeats the territorial target on every row: split it once among the plazas.
      // Without a reliable active/inactive source nobody is treated as inactive: zero management is evaluated as 0 %.
      const plazasIn = territory => people.filter(person => person.profile === "Promotor" && (
        person.status === "activo" ? inScope(person.territories, territory)
          : person.status === "vacante" && promoters.some(row => key(row.Empleado) === person.key && row.Territorio === territory && isNumber(row["Meta Cobertura"]))
      ))
      const splits = {}
      const result = countVsTarget(rows, "Clientes Visitados", (monthRows, month) => {
        const territoryRows = byMonth(promoters.filter(row => inScope(entity.territories, row.Territorio)), month)
        const perTerritory = uniqueTerritories(territoryRows).map(territory => {
          const values = territoryRows.filter(row => row.Territorio === territory).map(row => row["Meta Cobertura"]).filter(isNumber)
          if (!values.length) return null
          const territoryTarget = Math.max(...values)
          const plazas = plazasIn(territory)
          const divisor = Math.max(1, plazas.length)
          if (divisor > 1) (splits[month] ??= []).push(`${territoryLabel.get(key(territory)) ?? territory}: meta territorial ${territoryTarget} / ${divisor} plazas (${plazas.map(person => person.name).join(", ")}) = ${String(Math.round(territoryTarget / divisor * 100) / 100).replace(".", ",")}.`)
          return territoryTarget / divisor
        })
        if (!monthRows.length) (splits[month] ??= []).push(`Sin filas del promotor en ${month}: revisar; no se trata como inactividad.`)
        return addValues(perTerritory)
      }, { source: "promoters", scope, formula, notes })
      for (const [month, monthNotes] of Object.entries(splits)) result.months[month].notes.push(...monthNotes)
      return result
    }
    return countVsTarget(rows, "Clientes Visitados", monthRows => addValues(monthRows.map(row => row["Meta Cobertura y Visitas"])), {
      source: "commercial", scope: "Filas personales en Gestión comercial", formula: "Σ clientes únicos mensuales (Clientes Visitados) / Σ Meta Cobertura y Visitas mensual", notes,
    })
  }

  function countVsTarget(rows, field, monthlyTarget, { source, scope, formula, notes }) {
    const result = { source, scope, formula, notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const total = sumField(monthRows, field)
      const target = monthlyTarget(monthRows, month)
      result.months[month] = { actual: total.value, target, partial: false, blank: blankOnly(total), notes: total.blanks ? [`${total.blanks} de ${monthRows.length} filas sin ${field}: ${BLANK_AS_ZERO}`] : [] }
      actuals.push(total.value); targets.push(target)
    }
    const actual = addValues(actuals)
    result.quarter = {
      actual, target: addValues(targets), blank: months.every(month => result.months[month].blank),
      partial: actual !== null && actuals.some(value => value === null),
      notes: actuals.some(value => value === null) && actual !== null ? ["Meses sin dato: " + months.filter((_, index) => actuals[index] === null).join(", ")] : [],
    }
    return result
  }

  const QUARTER_FACTOR = { anual: 1 / 4, mensual: 3, trimestral: 1 }
  const PERIODICITY_TEXT = { anual: "meta anual / 4", mensual: "meta mensual × 3", trimestral: "meta trimestral" }

  function newClientsMeasure(entity) {
    const notes = [
      "Advertencia: La fuente no permite verificar si la medida incluye clientes recuperados. Se usa «Cant. Clientes Nuevos» contra «Meta Clientes Recuperar», sin sumar recuperados supuestos.",
      "El exportado repite el acumulado del trimestre en cada mes; el resultado mensual muestra el acumulado del trimestre.",
    ]
    if (entity.profile === "Promotor" && entity.kind === "individual") {
      const { field, periodicity, quarterTarget } = config.targets.newClients.promoters
      const formula = quarterTarget
        ? `Cant. Clientes Nuevos del exportado / ${quarterTarget} (meta trimestral histórica publicada: 30 × 3), tope 150 %`
        : `Máximo acumulado de Cant. Clientes Nuevos / (${field}: ${PERIODICITY_TEXT[periodicity]})`
      if (entity.status !== "activo") {
        const notApplicable = { actual: null, target: null, partial: false, notApplicable: true, notes: ["Vacante o posición sin titular: no genera meta de clientes nuevos (No aplica)."] }
        return { source: "promoters", scope: "Valor territorial repetido en las filas del promotor", formula, notes, months: Object.fromEntries(months.map(month => [month, notApplicable])), quarter: notApplicable }
      }
      const rows = personalRows(promoters, entity.person)
      notes.push("La cantidad de clientes nuevos es del territorio y se repite para cada promotor del territorio.")
      notes.push("Alcance: territorio asignado. Valor del territorio repetido en cada promotor; no representa autoría individual.")
      const monthValue = month => {
        const monthRows = byMonth(rows, month)
        return addValues(uniqueTerritories(monthRows).map(territory => {
          const values = monthRows.filter(row => row.Territorio === territory).map(row => row["Cant. Clientes Nuevos"]).filter(isNumber)
          return values.length ? Math.max(...values) : null
        }))
      }
      let target
      if (quarterTarget) {
        target = quarterTarget
        notes.push("Para continuidad con la metodología reportada en Q1 y Q2, el indicador se evalúa con la regla histórica publicada. La fuente Q3 presenta una escala diferente frente a periodos anteriores y se conserva trazabilidad del dato de origen para revisión futura.")
      } else {
        const targets = [...new Set(rows.map(row => row[field]).filter(isNumber))]
        if (targets.length > 1) notes.push(`«${field}» cambia entre meses o territorios; se usa la mayor.`)
        target = targets.length ? Math.max(...targets) * QUARTER_FACTOR[periodicity] : null
      }
      return cumulative(months.map(monthValue), target, { source: "promoters", scope: "Valor territorial repetido en las filas del promotor", formula, notes })
    }
    const { field, periodicity } = config.targets.newClients.commercial
    let rows, scope
    if (entity.kind === "individual") { rows = personalRows(commercial, entity.person); scope = "Filas personales en Gestión comercial" }
    else if (entity.kind === "territorio") { rows = commercial.filter(row => inScope(entity.territories, row.Territorio)); scope = "Filas de Gestión comercial del territorio" }
    else { rows = commercial.filter(row => inScope(operating, row.Territorio)); scope = "Consolidado de Gestión comercial de los territorios operativos" }
    const values = months.map(month => addValues(byMonth(rows, month).map(row => row["Cant. Clientes Nuevos"])))
    const sourceTargets = new Map()
    for (const row of rows) {
      if (!isNumber(row[field])) continue
      const identity = key(row.Territorio) + "|" + key(row.Empleado)
      const previous = sourceTargets.get(identity)
      if (previous !== undefined && previous !== row[field]) notes.push(`«${field}» de ${row.Empleado} en ${row.Territorio} cambia entre meses; se usa la mayor.`)
      sourceTargets.set(identity, Math.max(previous ?? 0, row[field]))
    }
    const total = addValues([...sourceTargets.values()])
    notes.push(`Meta tomada de «${field}» (metodología Q1/Q2); Power BI calcula Ejec. Clientes Nuevos = Cant. Clientes Nuevos / ${field}.`)
    return cumulative(values, total === null ? null : total * QUARTER_FACTOR[periodicity], {
      source: "commercial", scope,
      formula: `Máximo acumulado de Cant. Clientes Nuevos / (Σ ${field}: ${PERIODICITY_TEXT[periodicity]})`, notes,
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

  const ASSIGNED_SCOPE_NOTE = "Alcance: territorio asignado. Gestión del territorio, no autoría individual; el informe territorial usa la misma gestión."
  const technicalNotes = entity => entity.kind === "individual" ? [ASSIGNED_SCOPE_NOTE + " El exportado técnico no identifica persona."] : []
  const technicalScopeLabel = (entity, territories) => (entity.kind === "individual" ? "Territorio asignado: " : entity.kind === "direccion" ? "Territorios operativos: " : "Territorio: ") + labelTerritories(territories)

  function recommendationsMeasure(entity) {
    const territories = technicalScope(entity)
    const rows = technical.filter(row => inScope(territories, row.Territorio))
    const notes = technicalNotes(entity)
    const result = { source: "technical", scope: technicalScopeLabel(entity, territories), formula: "Σ Valor Recomendaciones / Σ Ppto", notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const value = sumField(monthRows, "Valor Recomendaciones"), budget = sumField(monthRows, "Ppto")
      const monthNotes = []
      if (value.blanks) monthNotes.push(`${value.blanks} de ${monthRows.length} grupos sin Valor Recomendaciones: ${BLANK_AS_ZERO}`)
      if (budget.blanks) monthNotes.push(`${budget.blanks} de ${monthRows.length} grupos sin Ppto`)
      result.months[month] = { actual: value.value, target: budget.value, partial: false, blank: blankOnly(value), notes: monthNotes }
      actuals.push(value.value); targets.push(budget.value)
    }
    const actual = addValues(actuals)
    result.quarter = { actual, target: addValues(targets), blank: months.every(month => result.months[month].blank), partial: actual !== null && actuals.some(value => value === null), notes: [] }
    if (actual === null) notes.push("Sin filas técnicas del alcance en el exportado: sin dato.")
    return result
  }

  function referencesMeasure(entity) {
    const territories = technicalScope(entity)
    const rows = technical.filter(row => inScope(territories, row.Territorio))
    const notes = [...technicalNotes(entity), "Una referencia recomendada en varios meses se cuenta en cada mes (el exportado no trae el código)."]
    if (entity.kind === "direccion") notes.push(DIRECTOR_REFERENCES_NOTE)
    const result = { source: "technical", scope: technicalScopeLabel(entity, territories), formula: "Σ (Meta Referencias × Referencias Recomendadas) de los meses / portafolio mensual (Σ Meta Referencias del mes)", notes, months: {} }
    const actuals = [], targets = []
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const count = sumField(monthRows, "Cantidad referencias"), portfolio = sumField(monthRows, "Meta Referencias")
      result.months[month] = { actual: count.value, target: portfolio.value, partial: false, blank: blankOnly(count), notes: count.blanks ? [`${count.blanks} de ${monthRows.length} grupos sin referencias: ${BLANK_AS_ZERO}`] : [] }
      actuals.push(count.value); targets.push(portfolio.value)
    }
    const actual = addValues(actuals)
    const presentTargets = targets.filter(isNumber)
    result.quarter = { actual, target: presentTargets.length ? addValues(presentTargets) / presentTargets.length : null, blank: months.every(month => result.months[month].blank), partial: actual !== null && actuals.some(value => value === null), notes: [] }
    if (actual === null) notes.push("Sin filas técnicas del alcance en el exportado: sin dato.")
    return result
  }

  // Published Q1/Q2 rule: per month, qualified = Σ Meta Leads of the person's rows and target = max(1, Meta Leads);
  // a month without records is 0 against 1. Vacancies and positions without a holder: their rows stay in the source
  // but are excluded from every calculation (null = No aplica).
  const VACANCY_LEADS_NOTE = "Registro asociado a usuario de vacante; excluido del cálculo por no existir evidencia de titular activo o gestión atribuible."
  const leadsRowText = row => `${row.Mes}: Meta Leads ${row["Meta Leads"] ?? "vacío"}, Calificados Oportunos ${row["Calificados Oportunos"] ?? "vacío"}, Fuera de Tiempo ${row["Fuera de Tiempo"] ?? "vacío"}, Leads calificados ${row["Leads calificados"] ?? "vacío"}, Pendientes ${row.Pendientes ?? "vacío"}`
  function excludedLeadRows(person) {
    return person.status === "activo" ? [] : leads.filter(row => key(row.Empleado) === person.key)
  }
  function leadsFor(person) {
    if (person.status !== "activo") return months.map(() => null)
    const rows = leads.filter(row => key(row.Empleado) === person.key)
    return months.map(month => {
      const monthRows = byMonth(rows, month)
      const assigned = sumField(monthRows, "Meta Leads").value ?? 0
      if (!assigned) return { assigned: 1, qualified: 0, onTime: 0, late: 0, pending: 0, minimum: true }
      const onTime = sumField(monthRows, "Calificados Oportunos").value
      const late = sumField(monthRows, "Fuera de Tiempo").value
      const pending = sumField(monthRows, "Pendientes").value
      return { assigned, qualified: assigned, onTime: onTime ?? 0, late, pending }
    })
  }

  function leadsMeasure(entity, field) {
    const members = entity.kind === "territorio"
      ? people.filter(person => person.profile !== "Director" && person.territories.some(territory => inScope(entity.territories, territory)))
      : [entity.person]
    const notes = []
    const perMember = members.map(member => ({ member, values: leadsFor(member) }))
    const withoutLeads = perMember.filter(item => item.values.every(value => value === null)).map(item => item.member.name)
    if (withoutLeads.length && entity.kind === "territorio") notes.push("Vacantes o posiciones sin titular (No aplica, no suman numerador ni meta): " + withoutLeads.join(", "))
    for (const member of members) for (const row of excludedLeadRows(member)) notes.push(`${VACANCY_LEADS_NOTE} ${member.name} · ${leadsRowText(row)}.`)
    const result = {
      source: "leads", scope: entity.kind === "territorio" ? "Leads de los titulares con territorio asignado en el territorio: " + members.filter(member => member.status === "activo").map(member => member.name).join(", ") : "Registros personales en Leads",
      formula: field === "onTime" ? "Σ Calificados Oportunos / Σ meta mensual (mayor entre 1 y Meta Leads)" : "Σ Meta Leads de las filas del titular / Σ meta mensual (mayor entre 1 y Meta Leads)",
      notes, months: {},
    }
    const noHolder = "Vacante o posición sin titular: No aplica"
    let quarterActual = null, quarterTarget = 0
    for (const [index, month] of months.entries()) {
      let actual = null, target = 0
      const monthNotes = []
      for (const { member, values } of perMember) {
        const value = values[index]
        if (!value) continue
        target += value.assigned
        const prefix = members.length > 1 ? member.name + ": " : ""
        if (field === "onTime") { actual = (actual ?? 0) + value.onTime; continue }
        if (value.minimum) { actual = actual ?? 0; monthNotes.push(`${prefix}sin leads registrados: meta mínima 1, gestión 0.`); continue }
        actual = (actual ?? 0) + value.qualified
        monthNotes.push(`${prefix}asignados ${value.assigned}; calificados ${value.qualified}; oportunos ${value.onTime}; fuera de tiempo ${value.late ?? 0}; pendientes ${value.pending ?? 0}`)
      }
      if (!target) { result.months[month] = { actual: null, target: null, partial: false, notApplicable: true, notes: [noHolder] }; continue }
      result.months[month] = { actual, target, partial: false, notes: monthNotes }
      if (actual !== null) quarterActual = (quarterActual ?? 0) + actual
      quarterTarget += target
    }
    const applicable = months.filter(month => !result.months[month].notApplicable)
    result.quarter = applicable.length
      ? { actual: quarterActual, target: quarterTarget, partial: false, notes: [] }
      : { actual: null, target: null, partial: false, notApplicable: true, notes: [noHolder] }
    return result
  }

  function fieldScope(entity, territoryField) {
    if (entity.kind === "direccion") return { territorial: true, territories: operating }
    if (entity.kind === "territorio" || usesAssignedTerritory(entity)) return { territorial: true, territories: entity.territories }
    return { territorial: false, territories: null, field: territoryField }
  }

  function activitiesMeasure(entity) {
    const scopeInfo = fieldScope(entity)
    const rows = entity.kind === "direccion" ? activities
      : scopeInfo.territorial ? activities.filter(row => inScope(scopeInfo.territories, row["Territorio de ventas"]))
      : activities.filter(row => key(row.Propietario) === entity.person.key)
    const target = fieldTarget(entity, fieldTargets.perActivePromoter.activitiesPerQuarter + fieldTargets.perActivePromoter.plotsPerQuarter, "actividades trimestrales")
    const notes = [target.note, "Parcelas no cuentan en Q3."]
    if (usesAssignedTerritory(entity)) notes.push(ASSIGNED_SCOPE_NOTE)
    const scope = entity.kind === "direccion" ? "Todas las actividades válidas de Agrícola Antioquia"
      : entity.kind === "territorio" ? "Actividades válidas con territorio de ventas en el territorio (cualquier propietario)"
      : scopeInfo.territorial ? "Territorio asignado: " + labelTerritories(entity.territories)
      : "Actividades válidas cuyo propietario es la persona"
    const result = { source: "activities", scope, formula: "Conteo de ID válidos / (3 actividades × promotores activos) por trimestre; mensual = trimestral / 3", notes, months: {} }
    for (const month of months) result.months[month] = { actual: rows.filter(row => monthOfActivity(row) === month).length, target: target.value === null ? null : target.value / months.length, partial: false, notes: [] }
    result.quarter = { actual: rows.length, target: target.value, partial: false, notes: [] }
    return result
  }

  function farmsMeasure(entity, kind) {
    const scopeInfo = fieldScope(entity)
    const rows = scopeInfo.territorial ? farms.filter(row => inScope(scopeInfo.territories, row.des_territorio))
      : farms.filter(row => key(row.atr_desc_empleado) === entity.person.key)
    const perQuarter = kind === "hectares" ? fieldTargets.perActivePromoter.hectaresPerQuarter : fieldTargets.perActivePromoter.cropsPerQuarter
    const target = fieldTarget(entity, perQuarter, kind === "hectares" ? "hectáreas trimestrales" : "cultivos trimestrales")
    const notes = [target.note, kind === "hectares" ? "La suma mensual no representa fincas únicas." : "Cuenta registros cultivo × empleado × mes; no son cultivos únicos."]
    if (usesAssignedTerritory(entity)) notes.push(ASSIGNED_SCOPE_NOTE)
    if (!rows.length) notes.push(config.policies.farmsWithoutRecords === "cero" ? "Sin registros en Fincas para el alcance: se toma 0." : "Sin registros en Fincas: sin dato.")
    const scope = entity.kind === "direccion" ? "Fincas de los territorios operativos"
      : entity.kind === "territorio" ? "Fincas registradas en el territorio (cualquier empleado)"
      : scopeInfo.territorial ? "Territorio asignado: " + labelTerritories(entity.territories)
      : "Fincas registradas a nombre de la persona"
    const unit = kind === "hectares" ? "90 ha" : "3 cultivos"
    const result = { source: "farms", scope, formula: kind === "hectares" ? `Σ hectáreas impactadas / (${unit} × promotores activos) por trimestre; mensual = trimestral / 3` : `Cultivos impactados / (${unit} × promotores activos) por trimestre; mensual = trimestral / 3`, notes, months: {} }
    const zero = config.policies.farmsWithoutRecords === "cero" ? 0 : null
    for (const month of months) {
      const monthRows = byMonth(rows, month)
      const actual = kind === "hectares" ? (monthRows.length ? sumField(monthRows, "Héctareas").value : zero) : (monthRows.length ? monthRows.filter(row => String(row.atr_cultivo_texto ?? "").trim()).length : zero)
      result.months[month] = { actual, target: target.value === null ? null : target.value / months.length, partial: false, notes: [] }
    }
    const actual = addValues(months.map(month => result.months[month].actual))
    result.quarter = { actual, target: target.value, partial: false, notes: [] }
    return result
  }

  const ATTRIBUTION = { personal: "Personal", assigned: "Territorio asignado", territory: "Territorio", consolidated: "Consolidado de territorios operativos", members: "Personas del territorio", none: "No aplica" }
  function attributionOf(id, entity) {
    if (id === "suelos") return ATTRIBUTION.none
    if (entity.kind === "direccion") return ["ejecucion_visitas", "cobertura_clientes", "leads_calificados", "leads_calificados_tiempo"].includes(id) ? ATTRIBUTION.personal : ATTRIBUTION.consolidated
    if (entity.kind === "territorio") return id.startsWith("leads") ? ATTRIBUTION.members : ATTRIBUTION.territory
    if (id === "recomendaciones" || id === "referencias") return ATTRIBUTION.assigned
    if (id === "nuevos_clientes" && entity.profile === "Promotor") return ATTRIBUTION.assigned
    if (["actividades_campo", "hectareas", "cultivos", "gestion-cultivos-impactados"].includes(id) && usesAssignedTerritory(entity)) return ATTRIBUTION.assigned
    return ATTRIBUTION.personal
  }

  // ---------- assembly ----------

  const NO_HOLDER_TERRITORY_NOTE = "Territorio sin titular activo (comercial y promotores vacantes o sin titular): No aplica. No genera metas ni cumplimiento."
  const VACANCY_BLANK_NOTE = "Vacante o posición sin titular sin gestión registrada: No aplica (el vacío no se convierte en 0 %)."
  const hasActiveHolder = territories => people.some(person => person.profile !== "Director" && person.status === "activo" && person.territories.some(territory => inScope(territories, territory)))

  function buildIndicator(id, measure, entity) {
    const definition = indicatorConfig.get(id)
    const indicator = {
      id, label: definition.label, weight: definition.weight, cap: definition.cap, calculationType: definition.calculationType,
      criterion: definition.criterion, pending: definition.pending, formula: measure.formula,
      source: SOURCE_LABELS[measure.source] ?? measure.source, attribution: attributionOf(id, entity), scope: measure.scope, notes: [...new Set(measure.notes)], periods: {},
    }
    for (const period of periods) {
      const value = period === quarter ? measure.quarter : measure.months[period]
      if (entity.noHolder) {
        indicator.periods[period] = { actual: null, target: null, ...NOT_APPLICABLE, notes: [NO_HOLDER_TERRITORY_NOTE] }
        continue
      }
      if (value.notApplicable) {
        indicator.periods[period] = { actual: null, target: null, ...NOT_APPLICABLE, notes: value.notes }
        continue
      }
      // Blanks only become 0 for an active holder; a vacancy without recorded management gets no compliance.
      if (entity.kind === "individual" && entity.status !== "activo" && (value.blank || value.actual === null)) {
        indicator.periods[period] = { actual: null, target: null, ...NOT_APPLICABLE, notes: [VACANCY_BLANK_NOTE] }
        continue
      }
      const evaluation = evaluateRatio({ actual: value.actual, target: value.target, cap: definition.cap, weight: definition.weight })
      indicator.periods[period] = { actual: value.actual, target: value.target, ...evaluation, status: evaluation.status === "ok" && value.partial ? "parcial" : evaluation.status, notes: value.notes }
    }
    return indicator
  }

  function cropManagement(indicators) {
    const definition = indicatorConfig.get("gestion-cultivos-impactados")
    const hectares = indicators.find(indicator => indicator.id === "hectareas"), crops = indicators.find(indicator => indicator.id === "cultivos")
    const indicator = { id: definition.id, label: definition.label, weight: 0, cap: definition.cap, calculationType: definition.calculationType, criterion: definition.criterion, pending: [], formula: "(Hectáreas + Cultivos) / 2", source: "Fincas", attribution: hectares.attribution, scope: "Derivado", notes: [], periods: {} }
    for (const period of periods) {
      const a = hectares.periods[period].recognizedCompliance, b = crops.periods[period].recognizedCompliance
      const value = a === null || b === null ? null : (a + b) / 2
      const withoutTarget = [hectares, crops].some(item => item.periods[period].status === "sin_meta")
      const notApplicable = [hectares, crops].every(item => item.periods[period].status === "no_aplica")
      indicator.periods[period] = { actual: null, target: null, rawCompliance: value, recognizedCompliance: value, contribution: 0, status: value !== null ? "ok" : notApplicable ? "no_aplica" : withoutTarget ? "sin_meta" : "sin_dato", notes: [] }
    }
    return indicator
  }

  function soilsIndicator() {
    const definition = indicatorConfig.get("suelos")
    const indicator = { id: definition.id, label: definition.label, weight: definition.weight, cap: definition.cap, calculationType: definition.calculationType, criterion: definition.criterion, pending: [], formula: "No se calcula", source: "Sin fuente confirmada", attribution: ATTRIBUTION.none, scope: "Excluido de Q3", notes: ["Sin fuente confirmada: No aplica (no equivale a 0%)."], periods: {} }
    for (const period of periods) indicator.periods[period] = { actual: null, target: null, ...NOT_APPLICABLE, notes: [] }
    return indicator
  }

  // Weights are never redistributed: result is points over 100, normalized is points over the evaluated weight.
  // Anything below 100 % evaluated weight is partial (no performance level).
  function summarize(indicators) {
    const results = {}
    const weighted = indicators.filter(indicator => indicator.weight > 0)
    const totalWeight = weighted.reduce((sum, indicator) => sum + indicator.weight, 0)
    for (const period of periods) {
      const evaluated = weighted.filter(indicator => indicator.periods[period].recognizedCompliance !== null)
      const evaluatedWeight = evaluated.reduce((sum, indicator) => sum + indicator.weight, 0)
      const result = evaluated.length ? evaluated.reduce((sum, indicator) => sum + indicator.periods[period].contribution, 0) : null
      const partial = weighted.some(indicator => indicator.periods[period].status === "parcial")
      const notApplicable = weighted.filter(indicator => indicator.periods[period].status === "no_aplica")
      const missing = weighted.filter(indicator => indicator.periods[period].recognizedCompliance === null && indicator.periods[period].status !== "no_aplica")
      const complete = Math.abs(evaluatedWeight - totalWeight) < 1e-9 && !partial
      const applicable = notApplicable.length < weighted.length
      results[period] = { result, normalized: result === null || !evaluatedWeight ? null : result / evaluatedWeight, evaluatedWeight, totalWeight, complete, applicable, missing: missing.map(indicator => indicator.label),
        withoutData: missing.filter(indicator => indicator.periods[period].status !== "sin_meta").map(indicator => indicator.label),
        withoutTarget: missing.filter(indicator => indicator.periods[period].status === "sin_meta").map(indicator => indicator.label),
        notApplicable: notApplicable.map(indicator => indicator.label) }
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
    indicators.push(cropManagement(indicators), soilsIndicator())
    const results = summarize(indicators)
    const pendingRules = [...new Set(indicators.flatMap(indicator => indicator.pending))]
    const observations = []
    if (entity.status === "vacante") observations.push("Posición vacante: el resultado es informativo y no corresponde a la evaluación de una persona.")
    if (entity.status === "sin_titular") observations.push("Posición sin titular en el exportado: el resultado es informativo.")
    if (entity.noHolder) observations.push(NO_HOLDER_TERRITORY_NOTE)
    const draftReasons = []
    if (!config.rulesValidated) draftReasons.push("Reglas pendientes de validación")
    if (!results[quarter].applicable) draftReasons.push("No aplica: territorio sin titular activo")
    else if (!results[quarter].complete) draftReasons.push(results[quarter].evaluatedWeight < results[quarter].totalWeight - 1e-9 ? "Resultado parcial: peso evaluado menor a 100 % en el trimestre" : "Resultado parcial: datos incompletos en algún indicador del trimestre")
    return {
      id: entity.id, kind: entity.kind, profile: entity.profile, name: entity.name, cargo: entity.cargo,
      territories: entity.territories, territoryLabel: labelTerritories(entity.territories),
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
  for (const unit of units) {
    entities.push(buildEntity({ id: "territorio-" + slug(unit.label), kind: "territorio", profile: "Territorio", name: unit.label, cargo: "Territorio " + unit.label, territories: unit.territories, status: "activo", noHolder: !hasActiveHolder(unit.territories) }))
  }
  for (const group of catalog.groups) globalObservations.push(`${group.label}: los territorios ${formatList(group.members.map(member => territoryLabel.get(key(member)) ?? member))} se conservan separados en la fuente y se evalúan como un solo territorio.`)
  globalObservations.push(`Metas de campo: ${activePromoters.length} promotores activos generan meta (${activePromoters.map(person => person.name).join(", ") || "ninguno"}). Sin meta: ${people.filter(person => person.profile === "Promotor" && !activePromoters.includes(person)).map(person => person.name).join(", ") || "ninguna vacante"}.`)

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
    pendingRules: config.pendingRules, approvedRules: config.approvedRules ?? [], rulesValidated: config.rulesValidated,
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

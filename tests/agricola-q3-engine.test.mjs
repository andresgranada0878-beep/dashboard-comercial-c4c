import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { prepareAgricolaBlock } from "../lib/agricola-import.mjs"
import { buildAgricolaReports, deriveCatalog, evaluateRatio, reconcile } from "../lib/agricola-q3/engine.mjs"

// Fictitious territories and people; no commercial data from the real exports.
const config = JSON.parse(readFileSync(new URL("../config/agricola-q3-2026.json", import.meta.url), "utf8"))
const ALFA = "PYC AGRÍCOLA ANT ALFA", BETA = "PYC AGRÍCOLA ANT BETA", GAMMA = "PYC AGRÍCOLA ANT GAMMA"
const DIR = "PYC AGRÍCOLA ANTIOQUIA DIRECCIÓN", DIRT = "PYC AGRÍCOLA ANTIOQUIA DIR TÉCNICA"
const tsv = (headers, rows) => [headers, ...rows].map(row => row.map(value => value ?? "").join("\t")).join("\n")

const commercial = tsv(
  ["Territorio", "Empleado", "Meta Cobertura y Visitas", "Clientes Visitados", "Cobertura Clientes", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Recuperar", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"],
  [
    [DIR, "Directora Ficticia", 1, 1, "", 1, "", "", "", "", "Julio"],
    [ALFA, "Directora Ficticia", "", 3, "", 4, "", "", "", "", "Julio"],
    [DIR, "Directora Ficticia", 1, 2, "", 2, "", "", "", "", "Agosto"],
    [DIR, "Directora Ficticia", 1, 3, "", 3, "", "", "", "", "Septiembre"],
    [ALFA, "Comercial Uno", 20, 9, "", 10, "", 40, 6, "", "Julio"],
    [ALFA, "Comercial Uno", 20, 10, "", 12, "", 40, 6, "", "Agosto"],
    [ALFA, "Comercial Uno", 20, 7, "", 8, "", 40, 6, "", "Septiembre"],
    [BETA, "Comercial Dos", 10, 5, "", 6, "", 8, 2, "", "Julio"],
    [GAMMA, "Comercial Dos", 5, 2, "", 2, "", 5, 2, "", "Julio"],
    [BETA, "Comercial Dos", 10, 4, "", 5, "", 8, 3, "", "Agosto"],
    [GAMMA, "Comercial Dos", 5, "", "", "", "", 5, 3, "", "Agosto"],
    [BETA, "Comercial Dos", 10, 6, "", 7, "", 8, 3, "", "Septiembre"],
    [GAMMA, "Comercial Dos", 5, 1, "", 1, "", 5, 3, "", "Septiembre"],
  ],
)
const promoters = tsv(
  ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"],
  ["Julio", "Agosto", "Septiembre"].flatMap(month => [
    [ALFA, "Promotor Uno", 30, 20, "", 60, 50, "", 10, 5, "", month],
    [ALFA, "(Vacante) Persona Tres", 30, "", "", 60, "", "", 10, 5, "", month],
    [BETA, "Promotor Dos", 12, 6, "", 60, 30, "", 10, 1, "", month],
  ]),
)
const technical = tsv(
  ["Territorio", "Grupo Artículos", "Ppto", "Valor Recomendaciones", "Meta Referencias", "Referencias Recomendadas", "Mes"],
  ["Julio", "Agosto", "Septiembre"].flatMap(month => [
    [ALFA, "Grupo 1", "$1.000.000", "$500.000", 10, "0,3", month],
    [ALFA, "Grupo 2", "$500.000", "", 10, "", month],
    [BETA, "Grupo 1", "$200.000", "", 10, "", month],
    [DIR, "Grupo 1", "", "", 10, "", month],
    [DIRT, "Grupo 1", "", "", 10, "", month],
  ]),
)
const leads = tsv(
  ["Unidad de Negocio", "Empleado", "Meta Leads", "Calificados Oportunos", "Fuera de Tiempo", "Leads calificados", "Pendientes", "Mes"],
  [
    ["Agrícola Antioquia", "Comercial Uno", 2, 1, "", "50 %", "", "Julio"],
    ["Agrícola Antioquia", "Comercial Uno", 1, "", 1, "100 %", "", "Septiembre"],
    ["Agrícola Antioquia", "Comercial Dos", 2, "", "", "", "", "Julio"],
    ["Agrícola Antioquia", "Promotor Dos", 1, 1, "", "", 1, "Agosto"],
    ["Otra Unidad", "Comercial Uno", 9, 9, "", "100 %", "", "Julio"],
  ],
)
const targets = tsv(
  ["Nombre", "Meta Actividades Trimestre", "Meta Hectáreas Mes", "Meta Cultivos Mes"],
  [
    ["Promotor Uno", 3, 30, 1],
    ["Alfa", 6, "", ""],
    ["(Vacante) Persona Tres", 3, 30, 1],
    ["Persona Inexistente", 1, 1, 1],
  ],
)
const farms = tsv(
  ["Unidad de Negocio", "des_territorio", "atr_desc_empleado", "atr_cultivo_texto", "# Fincas", "Héctareas", "Mes"],
  [
    ["Agrícola Antioquia", ALFA, "Promotor Uno", "Café", 2, 40, "Julio"],
    ["Agrícola Antioquia", ALFA, "Promotor Uno", "Café", 1, 20, "Agosto"],
  ],
)
const activities = [
  "Visitas (Todas)",
  "Actualización\tUTC-5",
  tsv(["ID", "Estado", "Tipo de visita", "Propietario", "Fecha/Hora de inicio", "Territorio de ventas"], [
    [1, "Completado", "Día de campo", "Promotor Uno", "15.07.2026 09:00 a. m.", ALFA],
    [2, "Completado", "Visita Formación", "Persona Externa", "02/09/2026", ALFA],
    [3, "Pendiente", "Día de campo", "Promotor Uno", "16/07/2026", ALFA],
    [4, "Completado", "Visita Parcela Demostrativa", "Promotor Uno", "17/07/2026", ALFA],
    [5, "Completado", "Día de campo", "Promotor Uno", "20/05/2026", ALFA],
  ]),
].join("\n")

const SOURCES = { commercial, promoters, technical, leads, farms, activities }
const prepare = () => Object.fromEntries(Object.entries(SOURCES).map(([id, text]) => [id, prepareAgricolaBlock(id, text, 2026, "Q3")]))
const blocks = prepare()
const reports = buildAgricolaReports({ blocks, config })
const entity = name => reports.entities.find(item => item.name === name)
const indicator = (name, id) => entity(name).indicators.find(item => item.id === id)

test("fixture blocks import without blocking issues", () => {
  for (const [id, block] of Object.entries(blocks)) assert.deepEqual(block.issues, [], id)
  assert.equal(blocks.leads.summary.selected, 4)
  assert.equal(blocks.leads.summary.excludedByReason["Otra unidad de negocio"], 1)
  assert.equal(blocks.activities.summary.selected, 2)
})

test("catalog comes from the exports: assigned territories carry a target", () => {
  const catalog = deriveCatalog(blocks, config)
  const director = catalog.people.find(person => person.profile === "Director")
  assert.equal(director.name, "Directora Ficticia")
  assert.deepEqual(director.territories, [DIR])
  assert.deepEqual(director.otherTerritories, [ALFA])
  assert.deepEqual(catalog.people.find(person => person.name === "Comercial Dos").territories, [BETA, GAMMA])
  assert.equal(catalog.people.find(person => person.name.startsWith("(Vacante)")).status, "vacante")
  const labels = catalog.territories.map(territory => territory.label)
  assert.deepEqual(labels, ["Alfa", "Beta", "Gamma", "Dirección", "Dirección Técnica"])
  assert.deepEqual(catalog.territories.filter(territory => !territory.operating).map(territory => territory.name), [DIR, DIRT])
})

test("visits and coverage compare monthly targets and sum them for the quarter", () => {
  const visits = indicator("Comercial Uno", "ejecucion_visitas")
  assert.equal(visits.periods.Julio.actual, 10)
  assert.equal(visits.periods.Julio.target, 20)
  assert.equal(visits.periods.Q3.actual, 30)
  assert.equal(visits.periods.Q3.target, 60)
  assert.equal(visits.periods.Q3.recognizedCompliance, 0.5)
  const coverage = indicator("Comercial Uno", "cobertura_clientes")
  assert.equal(coverage.periods.Q3.actual, 26)
  assert.equal(coverage.periods.Q3.target, 60)
})

test("multi-territory person sums both territories and blanks stay partial", () => {
  const visits = indicator("Comercial Dos", "ejecucion_visitas")
  assert.equal(visits.periods.Julio.target, 15)
  assert.equal(visits.periods.Agosto.actual, 5)
  assert.equal(visits.periods.Agosto.status, "parcial")
  const recs = indicator("Comercial Dos", "recomendaciones")
  assert.equal(recs.periods.Q3.actual, null)
  assert.equal(recs.periods.Q3.status, "sin_dato")
  assert.equal(recs.periods.Q3.target, 600000)
})

test("director: personal visits use the configured target and include other territories", () => {
  const visits = indicator("Directora Ficticia", "ejecucion_visitas")
  assert.equal(visits.periods.Julio.actual, 5)
  assert.equal(visits.periods.Julio.target, config.targets.director.visitsPerMonth)
  assert.ok(visits.notes.some(note => note.includes("otros territorios")))
  const references = indicator("Directora Ficticia", "referencias")
  assert.equal(references.periods.Julio.target, 30, "Dirección rows only repeat the portfolio and are excluded")
})

test("new clients: cumulative quarter value against annual target / 4", () => {
  const clients = indicator("Comercial Uno", "nuevos_clientes")
  assert.equal(clients.periods.Q3.actual, 6)
  assert.equal(clients.periods.Q3.target, 10)
  assert.equal(clients.periods.Julio.actual, 6, "monthly views show the quarter cumulative")
})

test("rule new clients: annual / 4 is not rounded, monthly × 3, cap 150%", () => {
  const twoTerritories = indicator("Comercial Dos", "nuevos_clientes")
  assert.equal(twoTerritories.periods.Q3.target, (8 + 5) / 4)
  assert.equal(twoTerritories.periods.Q3.actual, 6)
  assert.equal(twoTerritories.periods.Q3.recognizedCompliance, 1.5)
  assert.equal(twoTerritories.cap, 1.5)
  const promoter = indicator("Promotor Uno", "nuevos_clientes")
  assert.equal(promoter.periods.Q3.actual, 5)
  assert.equal(promoter.periods.Q3.target, 10 * 3)
})

test("rule coverage: quarter = Σ monthly unique clients / Σ monthly targets, no extra / 3", () => {
  const coverage = indicator("Comercial Uno", "cobertura_clientes")
  assert.deepEqual(["Julio", "Agosto", "Septiembre"].map(month => coverage.periods[month].actual), [9, 10, 7])
  assert.equal(coverage.periods.Q3.recognizedCompliance, 26 / 60)
  assert.equal(indicator("Directora Ficticia", "cobertura_clientes").periods.Q3.status, "sin_meta")
})

test("recommendations and references keep blanks as missing", () => {
  const recs = indicator("Comercial Uno", "recomendaciones")
  assert.equal(recs.periods.Julio.actual, 500000)
  assert.equal(recs.periods.Julio.target, 1500000)
  assert.equal(recs.periods.Julio.status, "parcial")
  const refs = indicator("Comercial Uno", "referencias")
  assert.equal(refs.periods.Julio.actual, 3)
  assert.equal(refs.periods.Julio.target, 20)
  assert.equal(refs.periods.Q3.actual, 9)
  assert.equal(refs.periods.Q3.target, 20)
})

test("rule leads: real qualified count over assigned leads; months without assignment are No aplica", () => {
  const qualified = indicator("Comercial Uno", "leads_calificados")
  assert.equal(qualified.periods.Julio.actual, 1)
  assert.equal(qualified.periods.Julio.target, 2)
  assert.equal(qualified.periods.Agosto.status, "no_aplica")
  assert.equal(qualified.periods.Q3.actual, 2, "never Meta Leads as numerator")
  assert.equal(qualified.periods.Q3.target, 3)
  assert.equal(qualified.periods.Q3.status, "ok")
  const onTime = indicator("Comercial Uno", "leads_calificados_tiempo")
  assert.equal(onTime.periods.Q3.actual, 1)
  assert.equal(onTime.periods.Q3.target, 3)
})

test("rule leads: assigned without management is 0; not assigned is No aplica; contradictory rows are not evaluated", () => {
  const unmanaged = indicator("Comercial Dos", "leads_calificados")
  assert.equal(unmanaged.periods.Julio.actual, 0)
  assert.equal(unmanaged.periods.Julio.target, 2)
  assert.equal(unmanaged.periods.Q3.recognizedCompliance, 0)
  assert.equal(indicator("Comercial Dos", "leads_calificados_tiempo").periods.Q3.actual, 0)
  const notAssigned = indicator("Promotor Uno", "leads_calificados")
  assert.equal(notAssigned.periods.Q3.status, "no_aplica")
  assert.equal(notAssigned.periods.Q3.contribution, null)
  assert.ok(entity("Promotor Uno").results.Q3.notApplicable.includes(notAssigned.label))
  assert.ok(!entity("Promotor Uno").results.Q3.missing.includes(notAssigned.label))
  const contradictory = indicator("Promotor Dos", "leads_calificados")
  assert.equal(contradictory.periods.Agosto.status, "sin_dato")
  assert.ok(contradictory.periods.Agosto.notes.some(note => note.includes("inconsistente")))
  assert.equal(indicator("Promotor Dos", "leads_calificados_tiempo").periods.Agosto.actual, 1)
})

test("rule attribution: individuals only get their own records; territory sums all valid records without reassigning", () => {
  assert.equal(indicator("Alfa", "ejecucion_visitas").periods.Julio.actual, 10 + 4, "director visits in Alfa count for the territory")
  assert.equal(indicator("Comercial Uno", "ejecucion_visitas").periods.Julio.actual, 10)
  assert.equal(indicator("Alfa", "actividades_campo").periods.Q3.actual, 2)
  assert.equal(indicator("Promotor Uno", "actividades_campo").periods.Q3.actual, 1)
  assert.equal(indicator("Comercial Uno", "actividades_campo").periods.Q3.actual, 0, "activities of other owners are not reassigned")
  assert.equal(indicator("Directora Ficticia", "actividades_campo").periods.Q3.actual, 2)
  assert.equal(indicator("Promotor Uno", "hectareas").periods.Q3.actual, 60)
  assert.equal(indicator("Comercial Uno", "hectareas").periods.Q3.actual, 0)
  assert.ok(reports.observations.some(note => note.includes("Persona Externa")))
})

test("rule auxiliary targets: no global defaults; without configuration they are Sin meta", () => {
  for (const id of ["actividades_campo", "hectareas", "cultivos"]) {
    for (const name of ["Promotor Uno", "Comercial Uno", "Alfa", "Directora Ficticia"]) {
      assert.equal(indicator(name, id).periods.Q3.target, null, `${name} ${id}`)
      assert.equal(indicator(name, id).periods.Q3.status, "sin_meta", `${name} ${id}`)
    }
  }
  assert.ok(reports.observations.some(note => note.includes("Metas auxiliares")))
})

test("rule auxiliary targets: explicit targets apply; vacancies never get one", () => {
  const withTargets = buildAgricolaReports({ blocks: { ...blocks, targets: prepareAgricolaBlock("targets", targets, 2026, "Q3") }, config })
  const find = (name, id) => withTargets.entities.find(item => item.name === name).indicators.find(item => item.id === id)
  assert.equal(find("Promotor Uno", "actividades_campo").periods.Q3.target, 3)
  assert.equal(find("Promotor Uno", "actividades_campo").periods.Julio.target, 1)
  const hectares = find("Promotor Uno", "hectareas")
  assert.equal(hectares.periods.Julio.recognizedCompliance, 40 / 30)
  assert.equal(hectares.periods.Septiembre.actual, 0)
  assert.equal(hectares.periods.Q3.target, 90)
  assert.equal(find("Alfa", "actividades_campo").periods.Q3.recognizedCompliance, 2 / 6)
  assert.equal(find("Alfa", "hectareas").periods.Q3.status, "sin_meta")
  assert.equal(find("(Vacante) Persona Tres", "actividades_campo").periods.Q3.target, null)
  assert.equal(find("Comercial Uno", "actividades_campo").periods.Q3.target, null, "commercial targets are not derived from promoters")
  assert.ok(withTargets.observations.some(note => note.includes("Persona Inexistente")))
})

test("rule territories: grouped territories stay separate in the source and are evaluated together", () => {
  const grouped = { ...config, catalog: { ...config.catalog, territoryGroups: [{ label: "Beta y Gamma", members: ["beta", "gamma"] }] } }
  const result = buildAgricolaReports({ blocks, config: grouped })
  const territories = result.entities.filter(item => item.kind === "territorio").map(item => item.name)
  assert.deepEqual(territories, ["Alfa", "Beta y Gamma"])
  const unit = result.entities.find(item => item.name === "Beta y Gamma")
  assert.deepEqual(unit.territories, [BETA, GAMMA])
  assert.equal(unit.indicators.find(item => item.id === "ejecucion_visitas").periods.Julio.actual, 6 + 2)
  assert.equal(result.entities.find(item => item.name === "Comercial Dos").territoryLabel, "Beta y Gamma")
  assert.deepEqual(result.territories.filter(item => item.operating).map(item => item.label), ["Alfa", "Beta", "Gamma"])
})

test("rule soils: shown as No aplica, never 0%, and excluded from the weights", () => {
  for (const item of reports.entities) {
    const soils = item.indicators.find(indicator => indicator.id === "suelos")
    assert.equal(soils.weight, 0)
    for (const period of reports.periods) {
      assert.equal(soils.periods[period].status, "no_aplica")
      assert.equal(soils.periods[period].recognizedCompliance, null)
    }
  }
  assert.ok(Math.abs(entity("Comercial Uno").results.Q3.totalWeight - 1) < 1e-9)
})

test("rule activities: only the four completed types, no plots, one per ID", () => {
  assert.equal(blocks.activities.summary.selected, 2)
  assert.deepEqual(blocks.activities.summary.byType, { "Día de campo": 1, "Visita Formación": 1 })
})

test("vacancy without data is informative and reports stay in draft", () => {
  const vacancy = entity("(Vacante) Persona Tres")
  assert.equal(vacancy.indicators.find(item => item.id === "ejecucion_visitas").periods.Q3.status, "sin_dato")
  assert.ok(vacancy.observations.some(note => note.includes("vacante")))
  for (const item of reports.entities) assert.equal(item.reportState, "borrador")
  const summary = entity("Comercial Uno").results.Q3
  assert.equal(summary.complete, false)
  assert.ok(summary.evaluatedWeight <= summary.totalWeight)
})

test("ratio evaluation applies caps and never invents targets", () => {
  assert.deepEqual(evaluateRatio({ actual: 3, target: 2, cap: 1.5, weight: 0.2 }), { rawCompliance: 1.5, recognizedCompliance: 1.5, contribution: 0.30000000000000004, status: "ok" })
  assert.equal(evaluateRatio({ actual: 3, target: null, cap: 1, weight: 0.1 }).status, "sin_meta")
  assert.equal(evaluateRatio({ actual: null, target: 3, cap: 1, weight: 0.1 }).status, "sin_dato")
})

test("reconcile compares counts with controls held outside the repository", () => {
  const checks = reconcile(blocks, { activities: { read: 5, selected: 2, byType: { "Día de campo": 1, "Visita Formación": 1 } }, farms: { months: { Julio: 1, Agosto: 1 } } })
  assert.ok(checks.every(check => check.ok), JSON.stringify(checks.filter(check => !check.ok)))
  assert.equal(reconcile({}, { leads: { read: 1 } })[0].ok, false)
})

test("duplicate rows and periods outside the quarter are reported", () => {
  const duplicated = prepareAgricolaBlock("promoters", promoters + "\n" + [ALFA, "Promotor Uno", 30, 1, "", 60, 1, "", 10, 5, "", "Julio"].join("\t"), 2026, "Q3")
  assert.ok(duplicated.issues.some(issue => issue.startsWith("Registro repetido")))
  const otherQuarter = prepareAgricolaBlock("farms", farms.replace("Julio", "Abril"), 2026, "Q3")
  assert.equal(otherQuarter.summary.excludedByReason["Mes fuera del periodo"], 1)
})

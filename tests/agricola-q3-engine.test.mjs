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
  ["Territorio", "Grupo Artículos", "Ppto", "Valor Recomendaciones", "Valor Ventas", "Meta Referencias", "Referencias Recomendadas", "Mes"],
  ["Julio", "Agosto", "Septiembre"].flatMap(month => [
    [ALFA, "Grupo 1", "$1.000.000", "$500.000", "$2.000.000", 10, "0,3", month],
    [ALFA, "Grupo 2", "$500.000", "", "$1.000.000", 10, "", month],
    [BETA, "Grupo 1", "$200.000", "", "$400.000", 10, "", month],
    [DIR, "Grupo 1", "", "", "", 10, "", month],
    [DIRT, "Grupo 1", "", "", "", 10, "", month],
  ]),
)
const leads = tsv(
  ["Unidad de Negocio", "Empleado", "Meta Leads", "Calificados Oportunos", "Fuera de Tiempo", "Leads calificados", "Pendientes", "Mes"],
  [
    ["Agrícola Antioquia", "Comercial Uno", 2, 1, "", "50 %", "", "Julio"],
    ["Agrícola Antioquia", "Comercial Uno", 1, "", 1, "100 %", "", "Septiembre"],
    ["Agrícola Antioquia", "Comercial Dos", 2, "", "", "", "", "Julio"],
    ["Agrícola Antioquia", "Promotor Dos", 1, 1, "", "", 1, "Agosto"],
    ["Agrícola Antioquia", "(Vacante) Persona Tres", 1, 1, "", "", 1, "Septiembre"],
    ["Otra Unidad", "Comercial Uno", 9, 9, "", "100 %", "", "Julio"],
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

test("Q3 sin promotor: solo el comercial aprobado queda con campo N/A y resultado normalizado", () => {
  const promoterWithoutBeta = promoters.split("\n").filter(row => !row.includes("\tPromotor Dos\t")).join("\n")
  const specialBlocks = { ...blocks, promoters: prepareAgricolaBlock("promoters", promoterWithoutBeta, 2026, "Q3") }
  const baseline = buildAgricolaReports({ blocks: specialBlocks, config })
  const custom = { ...config, targets: { ...config.targets, fieldTargets: { ...config.targets.fieldTargets,
    commercialWithoutPromoter: { people: ["Comercial Dos"], kpisNotApplicable: ["actividades_campo", "hectareas", "cultivos"], normalizeByApplicableWeight: true },
  } } }
  const updated = buildAgricolaReports({ blocks: specialBlocks, config: custom })
  const before = baseline.entities.find(item => item.name === "Comercial Dos")
  const after = updated.entities.find(item => item.name === "Comercial Dos")
  for (const id of ["actividades_campo", "hectareas", "cultivos"]) {
    const metric = after.indicators.find(item => item.id === id)
    assert.equal(metric.periods.Q3.status, "no_aplica")
    assert.equal(metric.periods.Q3.target, null)
  }
  assert.ok(Math.abs(after.results.Q3.evaluatedWeight - 0.8) < 1e-12)
  assert.ok(Math.abs(after.results.Q3.applicableWeight - 0.8) < 1e-12, "floating-point weights sum to 80%")
  assert.equal(after.results.Q3.normalizedToApplicableWeight, true)
  assert.ok(Math.abs(after.results.Q3.result - before.results.Q3.result / 0.8) < 1e-9)
  assert.equal(after.results.Q3.rawWeightedResult, before.results.Q3.result)
  assert.equal(after.results.Q3.complete, true)
  assert.equal(after.reportState, "final")
  assert.equal(updated.entities.find(item => item.name === "Comercial Uno").results.Q3.result,
    baseline.entities.find(item => item.name === "Comercial Uno").results.Q3.result,
    "La excepción no modifica otro comercial.")
  assert.equal(updated.entities.find(item => item.name === "Gamma").results.Q3.result,
    baseline.entities.find(item => item.name === "Gamma").results.Q3.result,
    "Tampoco modifica el territorio.")
})

test("fixture blocks import without blocking issues", () => {
  for (const [id, block] of Object.entries(blocks)) assert.deepEqual(block.issues, [], id)
  assert.equal(blocks.leads.summary.selected, 5)
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

test("multi-territory person sums both territories; blanks in existing rows are management 0 (Q1/Q2 SUMIFS)", () => {
  const visits = indicator("Comercial Dos", "ejecucion_visitas")
  assert.equal(visits.periods.Julio.target, 15)
  assert.equal(visits.periods.Agosto.actual, 5)
  assert.equal(visits.periods.Agosto.target, 15)
  assert.equal(visits.periods.Agosto.status, "ok")
  assert.ok(visits.periods.Agosto.notes.some(note => note.includes("vacío tratado como gestión 0")))
  const recs = indicator("Comercial Dos", "recomendaciones")
  assert.equal(recs.periods.Q3.actual, 0, "every group blank in existing technical rows: 0, not Sin dato")
  assert.equal(recs.periods.Q3.status, "ok")
  assert.equal(recs.periods.Q3.recognizedCompliance, 0)
  assert.equal(recs.periods.Q3.target, 1200000)
  assert.equal(indicator("Comercial Dos", "referencias").periods.Q3.recognizedCompliance, 0)
})

test("director: personal visits use the configured target and include other territories", () => {
  const visits = indicator("Directora Ficticia", "ejecucion_visitas")
  assert.equal(visits.periods.Julio.actual, 5)
  assert.equal(visits.periods.Julio.target, config.targets.director.visitsPerMonth)
  assert.ok(visits.notes.some(note => note.includes("otros territorios")))
  const references = indicator("Directora Ficticia", "referencias")
  assert.equal(references.periods.Julio.target, 30, "Dirección rows only repeat the portfolio and are excluded")
  assert.equal(references.periods.Q3.actual, 9, "Σ REF CANTIDAD of the consolidated territories, same as the territorial rule")
  assert.equal(references.periods.Q3.target, 30, "Σ Meta Referencias of the scope over the three months / 3")
  assert.ok(references.notes.some(note => note.startsWith("Corrección metodológica desde Q3; Q1/Q2 se conservan sin modificación")))
  assert.ok(!indicator("Alfa", "referencias").notes.some(note => note.startsWith("Corrección metodológica")))
})

test("regla Carolina Q3: solo se excluye la meta Bajo Cauca de visitas y cobertura individuales", () => {
  // ALFA/BETA del fixture representan Norte/Bajo Cauca: se conserva toda la gestión,
  // pero solo participa la cuota del territorio principal en el denominador personal.
  const withoutExtraQuota = { ...config, targets: { ...config.targets,
    commercialVisitCoverageExceptions: [{ person: "Comercial Dos", excludedTerritories: ["gamma"] }] } }
  const result = buildAgricolaReports({ blocks, config: withoutExtraQuota })
  const personal = result.entities.find(item => item.name === "Comercial Dos")
  for (const id of ["ejecucion_visitas", "cobertura_clientes"]) {
    const before = indicator("Comercial Dos", id).periods
    const after = personal.indicators.find(item => item.id === id).periods
    assert.equal(after.Q3.actual, before.Q3.actual, "se incluye toda la gestión real")
    assert.equal(after.Q3.target, 30, "solo BETA 10 mensual × 3; GAMMA 5 no se suma")
    assert.equal(after.Julio.target, 10)
  }
  for (const name of ["Beta", "Gamma", "Directora Ficticia"]) {
    const baseline = entity(name), next = result.entities.find(item => item.name === name)
    if (!baseline || !next) continue
    for (const id of ["ejecucion_visitas", "cobertura_clientes"]) {
      assert.equal(next.indicators.find(item => item.id === id).periods.Q3.target,
        baseline.indicators.find(item => item.id === id).periods.Q3.target,
        "las metas territoriales y dirección no cambian")
    }
  }
})

test("new clients: accumulated January–September, annual target scaled by 9/12", () => {
  const clients = indicator("Comercial Uno", "nuevos_clientes")
  assert.equal(clients.periods.Q3.actual, 6)
  assert.equal(clients.periods.Q3.target, 30)
  assert.equal(clients.periods.Julio.actual, null, "no verified historical snapshot")
})

test("rule new clients: YTD annual /12 × 9 rounded to whole clients", () => {
  const twoTerritories = indicator("Comercial Dos", "nuevos_clientes")
  assert.equal(twoTerritories.periods.Q3.target, 10)
  assert.equal(twoTerritories.periods.Q3.actual, 6)
  assert.equal(twoTerritories.periods.Q3.recognizedCompliance, 0.6)
  assert.equal(twoTerritories.cap, 1.5)
  const vacancy = indicator("(Vacante) Persona Tres", "nuevos_clientes")
  assert.equal(vacancy.periods.Q3.status, "no_aplica")
  assert.equal(vacancy.periods.Q3.contribution, null)
})

test("Carolina: meta anual Norte 68, meta acumulada septiembre 51, gestión 32", () => {
  const name = "Carolina María Escobar Londoño"
  const rows = ["Julio", "Agosto", "Septiembre"].flatMap(month => [
    ["PYC AGRÍCOLA ANT NORTE", name, 84, 28, "", 35, "", 68, 30, "", month],
    ["PYC AGRÍCOLA ANT BAJO CAUCA", name, 10, 5, "", 6, "", 9, 2, "", month],
  ])
  const records = prepareAgricolaBlock("commercial", commercial + "\n" + rows.map(row => row.join("\t")).join("\n"), 2026, "Q3")
  const conf = { ...config, targets: { ...config.targets,
    newClients: { ...config.targets.newClients, commercial: {
      ...config.targets.newClients.commercial,
      targetExclusions: [{ person: name, excludedTerritories: ["bajo cauca"] }],
    }},
  }}
  const result = buildAgricolaReports({ blocks: { ...blocks, commercial: records }, config: conf })
  const q = result.entities.find(item => item.name === name).indicators.find(item => item.id === "nuevos_clientes").periods
  assert.equal(q.Q3.actual, 32)
  assert.equal(q.Q3.target, 51)
  assert.equal(q.Q3.target - q.Q3.actual, 19)
  assert.equal(q.Q3.recognizedCompliance, 32/51)
  assert.equal(q.Julio.actual, null)
  assert.equal(q.Agosto.actual, null)
  assert.equal(q.Septiembre.actual, 32)
  assert.equal(q.Julio.target, 40)
  assert.equal(q.Agosto.target, 45)
  assert.equal(q.Septiembre.target, 51)
})

test("rule new clients (promoters): published historical rule MIN(150 %, source value / 90), with a methodology note", () => {
  const promoter = indicator("Promotor Uno", "nuevos_clientes")
  assert.equal(promoter.periods.Q3.actual, 5, "territorial value as exported, not split among promoters")
  assert.equal(promoter.periods.Q3.target, 90, "30 × 3, neither /30 nor /270")
  assert.equal(promoter.periods.Q3.recognizedCompliance, 5 / 90)
  assert.equal(promoter.periods.Q3.status, "ok")
  assert.ok(promoter.notes.some(note => note.startsWith("Para continuidad con la metodología reportada en Q1 y Q2") && note.includes("se conserva trazabilidad del dato de origen")))
  assert.deepEqual(promoter.pending, [])
  const header = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const rows = ["Julio", "Agosto", "Septiembre"].map(month => [ALFA, "Promotor Uno", 30, 6, "", 60, 50, "", 10, 240, "", month])
  const high = buildAgricolaReports({ blocks: { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(header, rows), 2026, "Q3") }, config })
  const capped = high.entities.find(item => item.name === "Promotor Uno").indicators.find(item => item.id === "nuevos_clientes").periods.Q3
  assert.ok(Math.abs(capped.rawCompliance - 240 / 90) < 1e-9)
  assert.equal(capped.recognizedCompliance, 1.5)
  assert.equal(indicator("Comercial Uno", "nuevos_clientes").periods.Q3.target, 30, "commercial YTD target updated")
})

test("rule coverage: quarter = Σ monthly unique clients / Σ monthly targets, no extra / 3", () => {
  const coverage = indicator("Comercial Uno", "cobertura_clientes")
  assert.deepEqual(["Julio", "Agosto", "Septiembre"].map(month => coverage.periods[month].actual), [9, 10, 7])
  assert.equal(coverage.periods.Q3.recognizedCompliance, 26 / 60)
  assert.equal(indicator("Directora Ficticia", "cobertura_clientes").periods.Q3.status, "ok")
})

test("recommendations and references: blank groups count as 0 and do not make the result partial", () => {
  const recs = indicator("Comercial Uno", "recomendaciones")
  assert.equal(recs.periods.Julio.actual, 500000)
  assert.equal(recs.periods.Julio.target, 3000000)
  assert.equal(recs.periods.Julio.status, "ok")
  assert.equal(recs.formula, "Σ Valor Recomendaciones / Σ Valor Ventas")
  assert.equal(recs.periods.Julio.recognizedCompliance, 500000 / 3000000, "el indicador usa ventas, no presupuesto")
  assert.ok(recs.periods.Julio.notes.some(note => note.startsWith("1 de 2 grupos sin Valor Recomendaciones") && note.includes("regla SUMIFS Q1/Q2")))
  assert.ok(!entity("Comercial Uno").indicators.some(item => item.periods.Q3.status === "parcial"))
  const refs = indicator("Comercial Uno", "referencias")
  assert.equal(refs.periods.Julio.actual, 3)
  assert.equal(refs.periods.Julio.target, 20)
  assert.equal(refs.periods.Q3.actual, 9)
  assert.equal(refs.periods.Q3.target, 20)
})

test("Promotores Q3: visitas fijas 180; cartera asignada cobertura mensual que suma x3 en Q3", () => {
  const adjusted = buildAgricolaReports({
    blocks: { ...blocks, visitTargets: { records: [{ Promotor: "Promotor Uno", "Meta visitas Q3": 37 }] } },
    config,
  })
  const promotor = adjusted.entities.find(item => item.name === "Promotor Uno")
  const visits = promotor.indicators.find(item => item.id === "ejecucion_visitas")
  const originalVisits = indicator("Promotor Uno", "ejecucion_visitas")
  assert.equal(visits.periods.Q3.target, 180, "cartera municipal NO modifica la meta de visitas")
  assert.equal(visits.periods.Q3.actual, originalVisits.periods.Q3.actual, "se conserva gestión")
  assert.equal(visits.periods.Q3.recognizedCompliance, 150 / 180, "visitas 50 × 3 frente a 180")
  assert.equal(visits.periods.Julio.target, 60)
  assert.equal(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Q3.target, 111,
    "la cartera municipal mensual de 37 clientes se evalúa los 3 meses: 111 Q3")
  assert.equal(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Q3.actual,
    indicator("Promotor Uno", "cobertura_clientes").periods.Q3.actual,
    "la gestión de clientes visitados permanece intacta")
  assert.ok(Math.abs(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Agosto.target - 37) < 1e-9)
  assert.equal(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Julio.target, 37,
    "se debe cubrir toda la cartera cada mes");
  assert.equal(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Septiembre.target, 37,
    "misma meta mensual de cobertura, sin alterar la cartera importada");
  assert.equal(promotor.indicators.find(item => item.id === "cobertura_clientes").periods.Q3.recognizedCompliance,
    60 / 111, "gestión de 20 × 3 frente a meta de 37 × 3");
  const unchanged = adjusted.entities.find(item => item.name === "Promotor Dos").indicators.find(item => item.id === "ejecucion_visitas")
  assert.equal(unchanged.periods.Q3.target, 180, "todos los promotores activos: 180 visitas Q3")
  assert.equal(adjusted.entities.find(item => item.name === "Promotor Dos").indicators.find(item => item.id === "cobertura_clientes").periods.Q3.target,
    indicator("Promotor Dos", "cobertura_clientes").periods.Q3.target, "no cambia cartera de promotores sin meta cargada")
  assert.deepEqual(["Julio", "Agosto", "Septiembre"].map(m => visits.periods[m].target), [60, 60, 60],
    "la meta fija aplica incluso cuando se importa otra meta municipal para cobertura")
  assert.equal(indicator("Promotor Uno", "ejecucion_visitas").periods.Q3.target, 180,
    "la meta fija se aplica aun sin importación municipal")
  assert.equal(adjusted.entities.find(item => item.name === "Comercial Uno").indicators.find(item => item.id === "ejecucion_visitas").periods.Q3.target,
    indicator("Comercial Uno", "ejecucion_visitas").periods.Q3.target)
  assert.equal(adjusted.entities.find(item => item.name === "(Vacante) Persona Tres").indicators.find(item => item.id === "ejecucion_visitas").periods.Q3.status, "no_aplica")
})

test("rule coverage (promoters): territorial target split among plazas (titulars + current vacancies); zero management is 0 %, never inferred inactivity", () => {
  const header = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const rows = ["Julio", "Agosto", "Septiembre"].flatMap(month => [
    [ALFA, "Promotor Uno", 30, 6, "", 60, 50, "", 10, 5, "", month],
    [ALFA, "(Vacante) Persona Tres", 30, "", "", 60, "", "", 10, 5, "", month],
    ...({ Julio: [[ALFA, "Promotor Cuatro", 30, 9, "", 60, 40, "", 10, 5, "", month]], Agosto: [], Septiembre: [[ALFA, "Promotor Cuatro", 30, 0, "", 60, 0, "", 10, 5, "", month]] })[month],
    [BETA, "Promotor Dos", 12, 6, "", 60, 30, "", 10, 1, "", month],
    [BETA, "(Vacante) Persona Residual", "", 1, "", "", 1, "", "", "", "", month],
  ])
  const split = buildAgricolaReports({ blocks: { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(header, rows), 2026, "Q3") }, config })
  const coverageOf = name => split.entities.find(item => item.name === name).indicators.find(item => item.id === "cobertura_clientes").periods
  const uno = coverageOf("Promotor Uno")
  assert.deepEqual(["Julio", "Agosto", "Septiembre"].map(month => uno[month].target), [10, 10, 10], "30 / 3 plazas: Uno, Cuatro and the vacancy")
  assert.equal(uno.Q3.actual, 18, "personal clients are never split")
  assert.equal(uno.Q3.target, 30)
  const cuatro = coverageOf("Promotor Cuatro")
  assert.equal(cuatro.Septiembre.status, "ok", "0 clients and 0 visits is evaluated, not inactivity")
  assert.equal(cuatro.Septiembre.actual, 0)
  assert.equal(cuatro.Septiembre.target, 10)
  assert.equal(cuatro.Agosto.target, 10, "a month without rows keeps its target")
  assert.equal(cuatro.Agosto.actual, null)
  assert.notEqual(cuatro.Agosto.status, "no_aplica")
  assert.ok(cuatro.Agosto.notes.some(note => note.includes("revisar")))
  assert.equal(cuatro.Q3.target, 30)
  assert.equal(coverageOf("(Vacante) Persona Tres").Q3.status, "no_aplica", "the vacancy counts in the divisor but gets no compliance")
  assert.equal(uno.Q3.target + cuatro.Q3.target + 30, 30 * 3, "the territorial target is counted once; the vacancy share is not redistributed")
  assert.equal(coverageOf("Promotor Dos").Q3.target, 36, "a residual vacancy without target does not count as a plaza")
  assert.equal(indicator("Promotor Uno", "cobertura_clientes").periods.Q3.target, 45, "base fixture: Uno + the vacancy = 2 plazas")
})

test("rule leads (published Q1/Q2 formula): qualified = Σ Meta Leads of the rows; monthly target = max(1, Meta Leads); a month without records is 0 against 1", () => {
  const qualified = indicator("Comercial Uno", "leads_calificados")
  assert.equal(qualified.periods.Julio.actual, 2, "Σ Meta Leads, not percentage × Meta Leads")
  assert.equal(qualified.periods.Julio.target, 2)
  assert.equal(qualified.periods.Agosto.actual, 0)
  assert.equal(qualified.periods.Agosto.target, 1)
  assert.equal(qualified.periods.Q3.actual, 2 + 0 + 1)
  assert.equal(qualified.periods.Q3.target, 2 + 1 + 1)
  assert.equal(qualified.formula, "Σ Meta Leads de las filas del titular / Σ meta mensual (mayor entre 1 y Meta Leads)")
  assert.equal(qualified.periods.Q3.status, "ok")
  const onTime = indicator("Comercial Uno", "leads_calificados_tiempo")
  assert.equal(onTime.periods.Q3.actual, 1)
  assert.equal(onTime.periods.Q3.target, 4)
})

test("rule leads: an active person without leads is 0 / 3 and keeps the weight; vacancy rows stay in the source but are excluded everywhere", () => {
  const unmanaged = indicator("Comercial Dos", "leads_calificados")
  assert.equal(unmanaged.periods.Julio.actual, 2, "historical formula: the empty percentage does not matter")
  assert.equal(unmanaged.periods.Julio.target, 2)
  assert.equal(indicator("Comercial Dos", "leads_calificados_tiempo").periods.Q3.actual, 0)
  for (const id of ["leads_calificados", "leads_calificados_tiempo"]) {
    const none = indicator("Promotor Uno", id)
    assert.equal(none.periods.Q3.actual, 0)
    assert.equal(none.periods.Q3.target, 3)
    assert.equal(none.periods.Q3.status, "ok")
    assert.equal(none.periods.Q3.contribution, 0)
    assert.ok(!entity("Promotor Uno").results.Q3.notApplicable.includes(none.label))
    const vacancy = indicator("(Vacante) Persona Tres", id)
    for (const period of ["Julio", "Agosto", "Septiembre", "Q3"]) {
      assert.equal(vacancy.periods[period].status, "no_aplica", `${id} ${period}: the vacancy row gives no compliance`)
      assert.equal(vacancy.periods[period].contribution, null)
    }
    assert.ok(vacancy.notes.some(note => note.startsWith("Registro asociado a usuario de vacante; excluido del cálculo por no existir evidencia de titular activo o gestión atribuible.") && note.includes("Septiembre")))
    const alfa = indicator("Alfa", id)
    assert.equal(alfa.periods.Q3.target, 4 + 3, "territory = Comercial Uno + Promotor Uno; the vacancy row adds no target")
    assert.equal(alfa.periods.Septiembre.target, 1 + 1)
    assert.ok(alfa.notes.some(note => note.startsWith("Registro asociado a usuario de vacante")))
  }
  assert.equal(indicator("Alfa", "leads_calificados_tiempo").periods.Q3.actual, 1, "only Comercial Uno's on-time lead; the vacancy's is excluded")
  assert.equal(entity("(Vacante) Persona Tres").results.Q3.notApplicable.includes("Leads calificados"), true)
  const noPercent = indicator("Promotor Dos", "leads_calificados")
  assert.equal(noPercent.periods.Agosto.status, "ok")
  assert.equal(noPercent.periods.Agosto.actual, 1, "Σ Meta Leads even with the percentage empty")
  assert.equal(indicator("Promotor Dos", "leads_calificados_tiempo").periods.Agosto.actual, 1)
})

test("rule attribution: promoters get their own field records; commercials get their assigned territory, flagged as such", () => {
  assert.equal(indicator("Alfa", "ejecucion_visitas").periods.Julio.actual, 10 + 4, "director visits in Alfa count for the territory")
  assert.equal(indicator("Comercial Uno", "ejecucion_visitas").periods.Julio.actual, 10)
  assert.equal(indicator("Alfa", "actividades_campo").periods.Q3.actual, 2)
  assert.equal(indicator("Promotor Uno", "actividades_campo").periods.Q3.actual, 1)
  assert.equal(indicator("Promotor Uno", "actividades_campo").attribution, "Personal")
  const assigned = indicator("Comercial Uno", "actividades_campo")
  assert.equal(assigned.periods.Q3.actual, 2, "same field management as the territory report")
  assert.equal(assigned.attribution, "Territorio asignado")
  assert.ok(assigned.scope.startsWith("Territorio asignado"))
  assert.equal(indicator("Directora Ficticia", "actividades_campo").periods.Q3.actual, 2)
  assert.equal(indicator("Promotor Uno", "hectareas").periods.Q3.actual, 60)
  assert.equal(indicator("Comercial Uno", "hectareas").periods.Q3.actual, 60)
  assert.ok(reports.observations.some(note => note.includes("Persona Externa")))
})

test("rule field targets: 3 activities, 90 ha and 3 crops per active promoter per quarter; vacancies never generate one", () => {
  const per = config.targets.fieldTargets.perActivePromoter
  assert.deepEqual([per.activitiesPerQuarter, per.hectaresPerQuarter, per.cropsPerQuarter, per.plotsPerQuarter], [3, 90, 3, 0])
  const target = (name, id) => indicator(name, id).periods.Q3.target
  assert.deepEqual(["actividades_campo", "hectareas", "cultivos"].map(id => target("Promotor Uno", id)), [3, 90, 3])
  assert.equal(indicator("Promotor Uno", "actividades_campo").periods.Julio.target, 1)
  assert.equal(indicator("Promotor Uno", "hectareas").periods.Julio.target, 30)
  assert.equal(indicator("Promotor Uno", "hectareas").periods.Q3.recognizedCompliance, 60 / 90)
  assert.equal(target("(Vacante) Persona Tres", "actividades_campo"), null)
  assert.equal(indicator("(Vacante) Persona Tres", "actividades_campo").periods.Q3.status, "sin_meta")
  assert.equal(target("Alfa", "actividades_campo"), 3, "Alfa: one active promoter, the vacancy does not count")
  assert.equal(target("Alfa", "hectareas"), 90)
  assert.equal(target("Beta", "cultivos"), 3)
  assert.equal(target("Gamma", "actividades_campo"), null, "no active promoter: Sin meta")
  assert.equal(target("Comercial Uno", "actividades_campo"), 3, "assigned territory Alfa")
  assert.equal(target("Comercial Dos", "hectareas"), 90, "Beta + Gamma: one active promoter")
  assert.deepEqual(["actividades_campo", "hectareas", "cultivos"].map(id => target("Directora Ficticia", id)), [6, 180, 6])
  for (const id of ["actividades_campo", "hectareas", "cultivos"]) {
    const territorial = ["Alfa", "Beta", "Gamma"].reduce((sum, name) => sum + (target(name, id) ?? 0), 0)
    assert.equal(target("Directora Ficticia", id), territorial, "director = sum of territorial targets")
  }
  assert.ok(indicator("Comercial Uno", "cultivos").notes.includes("Alcance: territorio asignado. Gestión del territorio, no autoría individual; el informe territorial usa la misma gestión."))
  assert.ok(reports.observations.some(note => note.includes("2 promotores activos") && note.includes("Persona Tres")))
})

test("rule technical attribution: individuals show the assigned territory, same management as the territory report", () => {
  for (const id of ["recomendaciones", "referencias"]) {
    const personal = indicator("Comercial Uno", id)
    assert.equal(personal.attribution, "Territorio asignado")
    assert.ok(personal.scope.startsWith("Territorio asignado: Alfa"))
    assert.ok(personal.notes.some(note => note.startsWith("Alcance: territorio asignado") && note.includes("no autoría individual")))
    assert.deepEqual(personal.periods.Q3, { ...indicator("Alfa", id).periods.Q3, notes: personal.periods.Q3.notes })
    assert.equal(indicator("Alfa", id).attribution, "Territorio")
  }
})

test("rule new clients: exported measure against Meta Clientes Recuperar, with a non-blocking warning", () => {
  const clients = indicator("Comercial Uno", "nuevos_clientes")
  assert.equal(clients.label, "Recuperación de clientes (nuevos + recuperados)")
  assert.ok(clients.notes.some(note => note.includes("La fuente no permite verificar si la medida incluye clientes recuperados.")))
  assert.deepEqual(clients.pending, [])
  const promoter = indicator("Promotor Uno", "nuevos_clientes")
  assert.equal(promoter.attribution, "Territorio asignado")
  assert.ok(promoter.notes.some(note => note.startsWith("Alcance: territorio asignado") && note.includes("no representa autoría individual")))
  for (const id of ["actividades_campo", "hectareas", "cultivos"]) assert.ok(!indicator("Promotor Uno", id).criterion.includes("RTC"))
  assert.equal(clients.periods.Q3.status, "ok")
  assert.equal(clients.cap, 1.5)
})

test("rule director: 20 visits per month; coverage = annual universe of 400 clients / 12 per month (Q3 target 100, never 400 nor the Dirección row's 1)", () => {
  assert.equal(config.targets.director.visitsPerMonth, 20)
  assert.equal(indicator("Directora Ficticia", "ejecucion_visitas").periods.Q3.target, 60)
  assert.equal(config.targets.director.coverageUniverse, 400)
  const coverage = indicator("Directora Ficticia", "cobertura_clientes")
  assert.ok(Math.abs(coverage.periods.Julio.target - 400 / 12) < 1e-9)
  assert.ok(Math.abs(coverage.periods.Q3.target - 100) < 1e-9)
  assert.equal(coverage.periods.Q3.actual, 4 + 2 + 3, "clients visited personally, including other territories")
  assert.ok(Math.abs(coverage.periods.Q3.recognizedCompliance - 0.09) < 1e-9)
  assert.equal(coverage.periods.Q3.status, "ok")
  assert.ok(coverage.notes.some(note => note.includes("400 / 12") && note.includes("no se usa como meta")))
  assert.deepEqual(entity("Directora Ficticia").pendingRules.includes("director-scope"), false)
  const withoutUniverse = buildAgricolaReports({ blocks, config: { ...config, targets: { ...config.targets, director: { ...config.targets.director, coverageUniverse: null } } } })
  const missing = withoutUniverse.entities.find(item => item.kind === "direccion")
  assert.equal(missing.indicators.find(item => item.id === "cobertura_clientes").periods.Q3.status, "sin_meta")
  assert.ok(missing.results.Q3.withoutTarget.includes(coverage.label))
})

test("rule partial results: weights are not redistributed; normalized = points / evaluated weight; no level when partial", () => {
  for (const item of reports.entities) {
    const summary = item.results.Q3
    if (summary.result === null) continue
    const points = item.indicators.reduce((sum, indicator) => sum + (indicator.periods.Q3.contribution ?? 0), 0)
    assert.ok(Math.abs(summary.result - points) < 1e-9, item.name)
    assert.ok(Math.abs(summary.normalized - summary.result / summary.evaluatedWeight) < 1e-9, item.name)
    if (summary.evaluatedWeight < summary.totalWeight - 1e-9) assert.equal(summary.complete, false, item.name)
  }
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

test("rule references: a grouped evaluation unit sums its management and takes the portfolio once, also in the director's consolidated Σ / 3", () => {
  const grouped = { ...config, catalog: { ...config.catalog, territoryGroups: [{ label: "Beta y Gamma", members: ["beta", "gamma"] }] } }
  const gammaRows = ["Julio", "Agosto", "Septiembre"].map(month => [GAMMA, "Grupo 1", "$100.000", "", "$150.000", 10, "0,2", month].join("\t")).join("\n")
  const withGamma = { ...blocks, technical: prepareAgricolaBlock("technical", technical + "\n" + gammaRows, 2026, "Q3") }
  const result = buildAgricolaReports({ blocks: withGamma, config: grouped })
  const references = name => result.entities.find(item => item.name === name).indicators.find(item => item.id === "referencias")
  const unit = references("Beta y Gamma")
  assert.equal(unit.periods.Julio.actual, 2, "Beta 0 + Gamma 10 × 0,2")
  assert.equal(unit.periods.Julio.target, 10, "portfolio once, never Beta 10 + Gamma 10")
  assert.equal(unit.periods.Q3.actual, 6)
  assert.equal(unit.periods.Q3.target, 10)
  assert.ok(unit.notes.some(note => note.includes("una sola vez")))
  assert.deepEqual(references("Comercial Dos").periods.Q3, unit.periods.Q3, "the holder uses the same evaluation unit")
  assert.equal(references("Alfa").periods.Q3.target, 20, "single territories are unchanged")
  assert.ok(!references("Alfa").notes.some(note => note.includes("una sola vez")))
  const director = references("Directora Ficticia")
  assert.equal(director.periods.Q3.actual, 9 + 6)
  assert.equal(director.periods.Julio.target, 20 + 10, "Alfa 20 + Beta y Gamma 10 once, never 20 + 10 + 10")
  assert.equal(director.periods.Q3.target, 20 + 10, "same evaluation units as the territorial reports")
  for (const item of result.entities.filter(entity => entity.kind === "territorio")) {
    assert.ok(director.periods.Q3.target >= references(item.name).periods.Q3.target, item.name)
  }
  assert.equal(director.periods.Q3.target, result.entities.filter(item => item.kind === "territorio").reduce((sum, item) => sum + references(item.name).periods.Q3.target, 0), "director target = Σ of the evaluation units' portfolios")
  const ungrouped = buildAgricolaReports({ blocks: withGamma, config })
  const ungroupedRefs = name => ungrouped.entities.find(item => item.name === name).indicators.find(item => item.id === "referencias")
  assert.equal(ungroupedRefs("Gamma").periods.Q3.target, 10)
  assert.equal(ungroupedRefs("Directora Ficticia").periods.Q3.target, 20 + 10 + 10, "separate units each keep their portfolio")
})

test("rule references (director): Norte and Bajo Cauca count the 302 portfolio once — 519 / (7 × 302) = 24,55 %", () => {
  const sources = ["ALFA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "NORTE", "BAJO CAUCA"].map(name => `PYC AGRÍCOLA ANT ${name}`)
  const share = { "PYC AGRÍCOLA ANT ALFA": { Julio: "0,5", Agosto: "0,5", Septiembre: "0,5" }, "PYC AGRÍCOLA ANT BETA": { Julio: "0,5" }, "PYC AGRÍCOLA ANT NORTE": { Julio: "0,25" }, "PYC AGRÍCOLA ANT BAJO CAUCA": { Agosto: "0,345" } }
  const rows = ["Julio", "Agosto", "Septiembre"].flatMap(month => sources.flatMap(territory => [
    [territory, "Grupo 1", "", "", "", 200, share[territory]?.[month] ?? "", month],
    [territory, "Grupo 2", "", "", "", 102, "", month],
  ]))
  const header = ["Territorio", "Grupo Artículos", "Ppto", "Valor Recomendaciones", "Valor Ventas", "Meta Referencias", "Referencias Recomendadas", "Mes"]
  const scaled = buildAgricolaReports({ blocks: { ...blocks, technical: prepareAgricolaBlock("technical", tsv(header, rows), 2026, "Q3") }, config })
  const references = name => scaled.entities.find(item => item.name === name)?.indicators.find(item => item.id === "referencias")
  const director = references("Directora Ficticia").periods.Q3
  assert.equal(director.actual, 519, "numerator unchanged: Σ REF CANTIDAD of every source territory")
  assert.equal(director.target, 7 * 302, "2.114, never 8 × 302 = 2.416")
  assert.equal(Number((director.rawCompliance * 100).toFixed(2)), 24.55)
  for (const month of ["Julio", "Agosto", "Septiembre"]) assert.equal(references("Directora Ficticia").periods[month].target, 7 * 302, month)
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

test("territory without an active holder is No aplica: no targets, no compliance", () => {
  const DELTA = "PYC AGRÍCOLA ANT DELTA"
  const withDelta = {
    ...blocks,
    commercial: prepareAgricolaBlock("commercial", commercial + "\n" + ["Julio", "Agosto", "Septiembre"].map(month => [DELTA, "(Vacante) Comercial Delta", 10, "", "", "", "", 4, "", "", month].join("\t")).join("\n"), 2026, "Q3"),
    technical: prepareAgricolaBlock("technical", technical + "\n" + ["Julio", "Agosto", "Septiembre"].map(month => [DELTA, "Grupo 1", "$300.000", "", "$900.000", 10, "", month].join("\t")).join("\n"), 2026, "Q3"),
  }
  const result = buildAgricolaReports({ blocks: withDelta, config })
  const delta = result.entities.find(item => item.kind === "territorio" && item.name === "Delta")
  for (const item of delta.indicators) for (const period of result.periods) assert.equal(item.periods[period].status, "no_aplica", `${item.id} ${period}`)
  assert.equal(delta.results.Q3.applicable, false)
  assert.equal(delta.results.Q3.result, null)
  assert.ok(delta.draftReasons.includes("No aplica: territorio sin titular activo"))
  const vacancy = result.entities.find(item => item.name === "(Vacante) Comercial Delta")
  assert.equal(vacancy.indicators.find(item => item.id === "ejecucion_visitas").periods.Q3.status, "no_aplica", "a blank vacancy row is not 0 %")
  assert.equal(result.entities.find(item => item.name === "Alfa").results.Q3.applicable, true)
  const directorRecs = result.entities.find(item => item.kind === "direccion").indicators.find(item => item.id === "recomendaciones").periods.Q3
  assert.equal(directorRecs.target, 9000000 + 1200000 + 2700000, "se toma venta y no Ppto de cada territorio operativo")
  assert.equal(directorRecs.status, "ok")
})

test("vacancy without data is informative; reports are final only when complete and every rule is validated", () => {
  const vacancy = entity("(Vacante) Persona Tres")
  assert.equal(vacancy.indicators.find(item => item.id === "ejecucion_visitas").periods.Q3.status, "no_aplica", "blank management of a vacancy is not converted to 0 %")
  assert.ok(vacancy.observations.some(note => note.includes("vacante")))
  assert.equal(config.rulesValidated, true)
  assert.deepEqual(config.pendingRules, [])
  assert.equal(entity("Comercial Uno").results.Q3.complete, true)
  assert.equal(entity("Comercial Uno").reportState, "final")
  assert.deepEqual(entity("Comercial Uno").draftReasons, [])
  for (const item of reports.entities) {
    assert.equal(item.reportState, item.draftReasons.length ? "borrador" : "final", item.name)
    assert.ok(!item.draftReasons.includes("Reglas pendientes de validación"), item.name)
  }
  assert.equal(vacancy.reportState, "borrador", "partial reports keep the draft mark with their reason")
  const pending = buildAgricolaReports({ blocks, config: { ...config, rulesValidated: false } })
  for (const item of pending.entities) assert.equal(item.reportState, "borrador")
  assert.deepEqual(pending.entities.find(item => item.name === "Comercial Uno").draftReasons, ["Reglas pendientes de validación"])
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


test("Q3 cobertura oficial: promotor Norte + Bajo Cauca = 232 mensuales, 696 trimestrales; conserva meta ante fila faltante", () => {
  const head = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const north = "PYC AGRÍCOLA ANT NORTE"
  const bajoCauca = "PYC AGRÍCOLA ANT BAJO CAUCA"
  const rows = ["Julio", "Agosto", "Septiembre"].flatMap((month, i) => [
    [north, "Promotor Grupo Ejemplo", 232, [31, 33, 40][i], "", 60, 41, "", 10, 10, "", month],
    [bajoCauca, "Promotor Grupo Ejemplo", 10, 0, "", 60, 0, "", 10, 0, "", month],
  ])
  const reportFor = sourceRows => buildAgricolaReports({
    blocks: { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(head, sourceRows), 2026, "Q3") },
    config,
  })
  const coverageFor = report => report.entities.find(item => item.name === "Promotor Grupo Ejemplo").indicators.find(item => item.id === "cobertura_clientes").periods
  const result = coverageFor(reportFor(rows))
  assert.deepEqual(["Julio", "Agosto", "Septiembre"].map(month => result[month].target), [232, 232, 232])
  assert.equal(result.Q3.target, 696)
  assert.equal(result.Q3.actual, 104)
  assert.ok(Math.abs(result.Q3.recognizedCompliance - 104 / 696) < 1e-12)
  const missing = coverageFor(reportFor(rows.filter(row => !(row[0] === north && row[11] === "Agosto"))))
  assert.equal(missing.Agosto.target, 232)
  assert.equal(missing.Q3.target, 696)
  assert.ok(missing.Agosto.notes.some(note => note.includes("Falta fila de Norte")))
})


test("Q3 metas territoriales validadas: 8 territorios, plazas compartidas, vacantes y control del total Power BI", () => {
  const head = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const positions = [
    ["BAJO CAUCA", "Promotor Norte Ejemplo", 10],
    ["NORTE", "Promotor Norte Ejemplo", 232],
    ["CÓRDOBA", "Promotor Córdoba Ejemplo", 163],
    ["ORIENTE A", "Promotor Oriente A Uno", 343],
    ["ORIENTE A", "Promotor Oriente A Dos", 343],
    ["ORIENTE B", "Promotor Oriente B Uno", 277],
    ["ORIENTE B", "Promotor Oriente B Dos", 277],
    ["SUROESTE", "Promotor Suroeste Uno", 180],
    ["SUROESTE", "Promotor Suroeste Dos", 180],
    ["SUROESTE", "(Vacante) Promotor Suroeste", 180],
    ["URABÁ", "(Vacante) Promotor Urabá", 49],
    ["VALLE ABURRÁ", "Promotor Valle Ejemplo", 95],
  ]
  const rows = config.months.flatMap(month => positions.map(([territory, employee, target]) =>
    ["PYC AGRÍCOLA ANT " + territory, employee, target, 0, "", 60, 0, "", 10, 0, "", month]))
  const inputBlocks = { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(head, rows), 2026, "Q3") }
  const result = buildAgricolaReports({ blocks: inputBlocks, config })
  const quarterTarget = name => result.entities.find(item => item.name === name).indicators
    .find(item => item.id === "cobertura_clientes").periods.Q3.target
  assert.equal(quarterTarget("Promotor Norte Ejemplo"), 696, "232 × 3; Bajo Cauca no agrega 10 × 3")
  assert.equal(quarterTarget("Promotor Córdoba Ejemplo"), 489)
  assert.equal(quarterTarget("Promotor Oriente A Uno"), 514.5, "343 × 3 / 2 plazas")
  assert.equal(quarterTarget("Promotor Oriente A Dos"), 514.5)
  assert.equal(quarterTarget("Promotor Oriente B Uno"), 415.5, "277 × 3 / 2 plazas")
  assert.equal(quarterTarget("Promotor Oriente B Dos"), 415.5)
  assert.equal(quarterTarget("Promotor Suroeste Uno"), 180, "180 × 3 / 3 plazas, incluida vacante con meta")
  assert.equal(quarterTarget("Promotor Suroeste Dos"), 180)
  assert.equal(quarterTarget("Promotor Valle Ejemplo"), 285)
  assert.equal(quarterTarget("(Vacante) Promotor Suroeste"), null)
  assert.equal(quarterTarget("(Vacante) Promotor Urabá"), null)
  assert.equal(Object.values(config.targets.promoterCoverage.monthlyTerritoryTargets).reduce((a,b) => a+b,0), 1349)
  assert.equal(config.targets.promoterCoverage.reconciliationStatus, "aceptada_sin_ajuste")
  assert.ok(!result.observations.some(line => line.includes("COBERTURA POR CONCILIAR")), "Diferencia aceptada no se presenta como pendiente")
  const affected = result.entities.find(item => item.name === "Promotor Norte Ejemplo")
  assert.ok(!affected.draftReasons.some(reason => reason.includes("diferencia de 13 clientes")), "Diferencia aceptada no bloquea informes")
  // El control se conserva cuando una discrepancia futura sí esté pendiente.
  const pendingConfig = {
    ...config,
    targets: {
      ...config.targets,
      promoterCoverage: { ...config.targets.promoterCoverage, reconciliationStatus: "pendiente" },
    },
  }
  const pendingReport = buildAgricolaReports({ blocks: inputBlocks, config: pendingConfig })
  const pendingPerson = pendingReport.entities.find(item => item.name === "Promotor Norte Ejemplo")
  assert.ok(pendingReport.observations.some(line => line.includes("COBERTURA POR CONCILIAR")))
  assert.ok(pendingPerson.draftReasons.some(reason => reason.includes("diferencia de 13 clientes")))
})

test("Q3 cobertura por plazas: plazas sin titular con meta entran en divisor; sin meta no cuentan", () => {
  const header = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const territory = "PYC AGRÍCOLA ANT SUROESTE"
  const rows = config.months.flatMap(month => [
    [territory, "Promotor Activo Ejemplo", 180, 0, "", 60, 0, "", 10, 0, "", month],
    [territory, "(Vacante) Plaza Ejemplo", 180, "", "", 60, "", "", 10, "", "", month],
    [territory, "POSICION SIN TITULAR", 180, "", "", 60, "", "", 10, "", "", month],
    [territory, "(Vacante) Sin Meta Ejemplo", "", "", "", "", "", "", "", "", "", month],
  ])
  const report = buildAgricolaReports({
    blocks: { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(header, rows), 2026, "Q3") },
    config,
  })
  const find = name => report.entities.find(entity => entity.name === name).indicators
    .find(indicator => indicator.id === "cobertura_clientes").periods.Q3
  assert.equal(config.targets.promoterCoverage.methodology, "por_plazas_promotores")
  assert.equal(find("Promotor Activo Ejemplo").target, 180, "180 mensuales / 3 plazas × 3 meses")
  assert.equal(find("Promotor Activo Ejemplo").recognizedCompliance, 0)
  assert.equal(find("(Vacante) Plaza Ejemplo").status, "no_aplica")
  assert.equal(find("POSICION SIN TITULAR").status, "no_aplica")
  assert.equal(find("(Vacante) Sin Meta Ejemplo").status, "no_aplica")
})


test("Q3 visitas promotores: la meta personal mensual no se divide entre plazas y un mes sin fila no borra la meta", () => {
  const header = ["Territorio", "Empleado", "Meta Cobertura", "Clientes Visitados", "Cobertura Clientes", "Meta Visitas ", "Cant. Visitas", "Ejec. Visitas", "Meta Clientes Nuevos", "Cant. Clientes Nuevos", "Ejec. Clientes Nuevos", "Mes"]
  const territory = "PYC AGRÍCOLA ANT ORIENTE B"
  const rows = [
    [territory, "Promotor Ejemplo Uno", 277, 18, "", 60, 45, "", 10, 0, "", "Julio"],
    [territory, "Promotor Ejemplo Dos", 277, 11, "", 60, 30, "", 10, 0, "", "Julio"],
    [territory, "Promotor Ejemplo Dos", 277, 12, "", 60, 31, "", 10, 0, "", "Agosto"],
    [territory, "Promotor Ejemplo Uno", 277, 20, "", 60, 46, "", 10, 0, "", "Septiembre"],
    [territory, "Promotor Ejemplo Dos", 277, 10, "", 60, 29, "", 10, 0, "", "Septiembre"],
  ]
  const report = buildAgricolaReports({
    blocks: { ...blocks, promoters: prepareAgricolaBlock("promoters", tsv(header, rows), 2026, "Q3") },
    config,
  })
  const entity = report.entities.find(item => item.name === "Promotor Ejemplo Uno")
  const visits = entity.indicators.find(item => item.id === "ejecucion_visitas").periods
  const coverage = entity.indicators.find(item => item.id === "cobertura_clientes").periods
  assert.deepEqual(config.months.map(month => visits[month].target), [60, 60, 60])
  assert.equal(visits.Q3.target, 180)
  assert.equal(visits.Q3.actual, 91)
  assert.equal(visits.Agosto.actual, null)
  assert.equal(visits.Q3.status, "parcial", "el reporte expone el estado parcial, no el campo interno partial")
  assert.equal(coverage.Q3.target, 415.5, "cobertura sí se divide entre dos plazas")
  assert.ok(entity.indicators.find(item => item.id === "ejecucion_visitas").notes.some(note => note.includes("independiente de la cartera municipal")))
})

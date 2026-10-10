import test from "node:test"
import assert from "node:assert/strict"
import { parseAccountExport, parseOfficialMunicipalities, buildMunicipalPortfolio, keyOfMunicipality } from "../lib/agricola-q3/municipal-portfolio.mjs"

function accounts(rows) {
  const headers = Array(10).fill(null)
  headers[1] = "Nombre o razón social"; headers[3] = "Ciudad"; headers[4] = "Departamento"
  headers[5] = "CLIENTE VISITABLE"; headers[6] = "ID de cliente"
  return [["Clientes (Todo)"], [], headers, ...rows.map(([id, city, department, visitable]) => {
    const row = Array(10).fill(null)
    row[3] = city; row[4] = department; row[5] = visitable; row[6] = id
    return row
  })]
}
function matrix(rows) {
  const headers = Array(12).fill(null)
  headers[0] = "Clave municipio / depto"; headers[1] = "Municipio"; headers[2] = "Departamento"
  headers[9] = "PROMOTOR OFICIAL (EDITAR)"; headers[10] = "TERRITORIO OFICIAL (EDITAR)"
  return [["MATRIZ"], [], headers, ...rows.map(([city, department, promoter, territory]) => {
    const row = Array(12).fill(null)
    row[0] = city + " | " + department; row[1] = city; row[2] = department; row[9] = promoter; row[10] = territory
    return row
  })]
}

test("municipios: misma ciudad en departamentos distintos no comparte promotor", () => {
  const a = parseAccountExport(accounts([
    ["100", "LA UNION", "ANTIOQUIA", "Sí"], ["101", "LA UNION", "SUCRE", "Sí"],
    ["102", "EL CARMEN", "ANTIOQUIA", "No"], ["103", null, "ANTIOQUIA", "Sí"],
  ]))
  const m = parseOfficialMunicipalities(matrix([
    ["LA UNION", "ANTIOQUIA", "Promotor A", "Oriente"],
    ["LA UNION", "SUCRE", "Promotor B", "Córdoba"],
    ["EL CARMEN", "ANTIOQUIA", null, null],
  ]))
  const result = buildMunicipalPortfolio(a, m)
  assert.deepEqual(result.issues, [])
  assert.equal(result.summary.accounts, 4)
  assert.equal(result.summary.visitable, 3)
  assert.equal(result.summary.assignedVisitable, 2)
  assert.equal(result.summary.withoutCityVisitable, 1)
  assert.equal(result.summary.pending, 1)
  assert.equal(result.promoters.length, 2)
  assert.equal(result.summary.complete, false)
  assert.equal(keyOfMunicipality("La Unión", "Antioquia"), "LA UNION | ANTIOQUIA")
})

test("municipios: no inferir promotor de creador histórico; un responsable sin territorio no se asigna", () => {
  const a = parseAccountExport(accounts([["200", "URRAO", "ANTIOQUIA", "Sí"]]))
  const m = parseOfficialMunicipalities(matrix([["URRAO", "ANTIOQUIA", "Promotor A", ""]]))
  const result = buildMunicipalPortfolio(a, m)
  assert.equal(result.promoters.length, 0)
  assert.equal(result.summary.pendingVisitable, 1)
  assert.ok(result.issues.some(x => x.includes("incompletos")))
})

test("municipios: IDs duplicados no inflan cartera", () => {
  const a = parseAccountExport(accounts([["201", "ABEJORRAL", "ANTIOQUIA", "Sí"], ["201", "ABEJORRAL", "ANTIOQUIA", "Sí"]]))
  const m = parseOfficialMunicipalities(matrix([["ABEJORRAL", "ANTIOQUIA", "Promotor A", "Oriente"]]))
  const result = buildMunicipalPortfolio(a, m)
  assert.equal(result.summary.accounts, 1)
  assert.equal(result.summary.assignedVisitable, 1)
  assert.ok(result.issues.some(x => x.includes("duplicada")))
  assert.equal(result.summary.complete, false)
})

test("municipios: informe completo requiere responsable y territorio de todos los clientes", () => {
  const a = parseAccountExport(accounts([["300", "YARUMAL", "ANTIOQUIA", "Sí"]]))
  const m = parseOfficialMunicipalities(matrix([["YARUMAL", "ANTIOQUIA", "Promotor Norte", "Norte"]]))
  const result = buildMunicipalPortfolio(a, m)
  assert.equal(result.summary.complete, true)
  assert.equal(result.promoters[0].visitable, 1)
  assert.equal(result.promoters[0].municipalities, 1)
})

test("municipios: cabeceras incompletas bloquean conciliación", () => {
  const a = parseAccountExport([["Cuenta", "Ciudad"]])
  const m = parseOfficialMunicipalities([["Municipio", "Responsable"]])
  const report = buildMunicipalPortfolio(a, m)
  assert.equal(report.summary.complete, false)
  assert.equal(report.issues.length, 2)
})

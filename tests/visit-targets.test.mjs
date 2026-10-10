import test from "node:test"
import assert from "node:assert/strict"
import { prepareVisitTargetsRows } from "../lib/agricola-q3/visit-targets.mjs"

test("Visitas: importa meta Q3 una sola vez por promotor", () => {
  const input = [["Promotor", "Meta visitas Q3"], ["Gloria Marcela Ramirez Ramirez", 149], ["Santiago Idarraga Hurtado", 187]]
  const out = prepareVisitTargetsRows(input)
  assert.deepEqual(out.issues, [])
  assert.equal(out.records.length, 2)
  assert.equal(out.records[0]["Meta visitas Q3"], 149)
  assert.equal(out.summary.selected, 2)
})

test("Visitas: encabezado y metas inválidas bloquean la importación", () => {
  assert.ok(prepareVisitTargetsRows([["Promotor", "Meta"]]).issues.length)
  const out = prepareVisitTargetsRows([["Promotor", "Meta visitas Q3"], ["Gloria", 149], ["GLORIA", 160], ["Otro", "0"], ["Tres", "-2"]])
  assert.ok(out.issues.some(x => x.includes("duplicado")))
  assert.ok(out.issues.some(x => x.includes("inválida")))
})

test("Visitas: conserva entero y rechaza cantidad no entera", () => {
  const out = prepareVisitTargetsRows([["Promotor", "Meta visitas Q3"], ["Primero", 75.5], ["Segundo", 75]])
  assert.equal(out.records.length, 1)
  assert.equal(out.records[0].Promotor, "Segundo")
  assert.ok(out.issues.length)
})

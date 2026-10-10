import test from "node:test"
import assert from "node:assert/strict"
import { rawNumber, prepareAgricolaBlock, prepareAgricolaRows, technicalReferenceCount } from "../lib/agricola-import.mjs"
test("numbers preserve missing values and support decimal commas and percentages",()=>{
 assert.equal(rawNumber(""),null);assert.equal(rawNumber("1.234,50"),1234.5);assert.equal(rawNumber("12,5%"),0.125);assert.ok(Number.isNaN(rawNumber("abc")))
})
test("references are quantities derived from a proportion",()=>{
 assert.equal(technicalReferenceCount({"Meta Referencias":62,"Referencias Recomendadas":7/62}),7)
 assert.equal(technicalReferenceCount({"Meta Referencias":62,"Referencias Recomendadas":null}),null)
})
test("activity preamble, quoted headings and all-channel export",()=>{
 const text='Visitas (Todas)\nActualización\tUTC-5\n"ID"\t"Estado"\t"Tipo de visita"\t"Propietario"\t"Fecha/Hora de inicio"\t"Territorio de ventas"\n1\tCompletado\tDía de campo\tEmpleado\t01/07/2026\tPYC AGRÍCOLA ANT NORTE'
 const result=prepareAgricolaBlock("activities",text,2026,"Q3")
 assert.equal(result.records.length,1);assert.deepEqual(result.issues,[])
})
test("missing source headings block import",()=>{
 assert.ok(prepareAgricolaBlock("leads","Empleado\tMes\nPersona\tJulio",2026,"Q3").issues.includes("Falta columna: Meta Leads"))
})

test("headerless Visitas Todas: código cliente repetido no deduplica actividades distintas", () => {
  const row = (date, territory = "PYC AGRÍCOLA ANT NORTE") => {
    const cells = Array(32).fill(null)
    cells[1] = "Completado"
    cells[2] = "Actividad de campo"
    cells[3] = "CLIENTE-100"
    cells[5] = "Evento Especial"
    cells[6] = "Promotor Ejemplo"
    cells[10] = date
    cells[16] = territory
    return cells
  }
  const preamble = [Array(32).fill(null), Array(32).fill(null), Array(32).fill(null)]
  preamble[0][1] = "Visitas (Todas)"
  const rows = [...preamble, row(46225), row(46226), row(46227, "GALAGRO BOYACA NAL.")]
  const prepared = prepareAgricolaRows("activities", rows, 2026, "Q3", { origin: "file" })
  assert.deepEqual(prepared.issues, [])
  assert.equal(prepared.summary.read, 3)
  assert.equal(prepared.summary.selected, 2)
  assert.equal(prepared.records[0].ID, "C4C-EXPORT-4")
  assert.equal(prepared.records[1].ID, "C4C-EXPORT-5")
  assert.ok(prepared.warnings.some(note => note.includes("sin encabezados")))
})

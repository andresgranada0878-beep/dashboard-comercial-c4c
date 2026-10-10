import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

test("Q3 PDF dependency generates a valid landscape PDF with wrapped table content", () => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  autoTable(doc, {
    startY: 88,
    head: [["Indicador", "Gestión real", "Meta", "Cumplimiento", "Peso", "Aporte", "Estado", "Tipo de cálculo"]],
    body: [
      ["Cobertura clientes", "104", "696", "14,9 %", "10 %", "1,49 %", "Completo", "Gestión / meta"],
      ["Observación: " + "Revisar conciliación del dato territorial. ".repeat(9), "-", "-", "-", "-", "-", "Parcial", "Observaciones"],
    ],
    margin: { left: 14, right: 14, bottom: 18 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 27 }, 2: { cellWidth: 27 }, 3: { cellWidth: 26 }, 4: { cellWidth: 16 }, 5: { cellWidth: 20 }, 6: { cellWidth: 25 }, 7: { cellWidth: 38 } },
  })
  const bytes = Buffer.from(doc.output("arraybuffer"))
  assert.ok(bytes.byteLength > 1000, "La descarga PDF debe contener datos")
  assert.equal(bytes.subarray(0, 4).toString("latin1"), "%PDF")
  assert.ok(doc.getNumberOfPages() >= 1)
})

test("Q3 Excel dependency preserves indicator numbers and five traceability sheets", () => {
  const workbook = XLSX.utils.book_new()
  const rows = [
    { Nombre: "Promotor de prueba", Indicador: "Cobertura clientes", "Gestión real": 104, Meta: 696, Cumplimiento: 104 / 696, Aporte: (104 / 696) * 0.1 },
  ]
  for (const name of ["Resultados", "Trazabilidad", "Reglas", "Observaciones", "Conciliación"]) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name)
  }
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
  const restored = XLSX.read(bytes, { type: "buffer" })
  assert.deepEqual(restored.SheetNames, ["Resultados", "Trazabilidad", "Reglas", "Observaciones", "Conciliación"])
  const trace = XLSX.utils.sheet_to_json(restored.Sheets["Trazabilidad"])
  assert.equal(trace[0].Meta, 696)
  assert.equal(trace[0]["Gestión real"], 104)
  assert.ok(Math.abs(trace[0].Cumplimiento - 104 / 696) < 1e-12)
})

test("Q3 dashboard routes expose PDF and Excel download actions", () => {
  const screen = readFileSync("app/agricola-q3/page.tsx", "utf8")
  assert.match(screen, /exportIndividualPdf\(/)
  assert.match(screen, /exportIndividualPdfBundle\(/)
  assert.match(screen, /downloadTraceWorkbook\(/)
  const source = readFileSync("lib/agricola-q3/trace-workbook.ts", "utf8")
  assert.match(source, /XLSX\.writeFile\(/)
})

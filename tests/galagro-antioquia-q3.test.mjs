import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { prepareAgricolaBlock, prepareAgricolaRows } from "../lib/agricola-import.mjs"
import { buildAgricolaReports } from "../lib/agricola-q3/engine.mjs"

const cfg = JSON.parse(fs.readFileSync(new URL("../config/galagro-antioquia-q3-2026.json", import.meta.url), "utf8"))
const hCommercial = ["Territorio","Empleado","Meta Cobertura y Visitas","Clientes Visitados","Cant. Visitas","Meta Clientes Recuperar","Cant. Clientes Nuevos","Mes"]
const gal = "GALAGRO ORIENTE A ANT.", agr = "PYC AGRICOLA ANT ORIENTE A", nac = "GALAGRO CENTRO NAL"
const m = (territory, name, month) => [territory, name, 12, 5, 6, 48, 4, month]

test("Galagro Q3: excluir Agrícola, Galagro Nacional y meses ajenos", () => {
  const x = prepareAgricolaRows("commercial", [hCommercial,m(gal,"Comercial Demo","Julio"),m(agr,"Otra persona","Agosto"),m(nac,"Nacional","Septiembre"),m(gal,"Comercial Demo","Mayo")],2026,"Q3",{sourceKey:"GAL-ANT"})
  assert.equal(x.issues.length,0)
  assert.equal(x.records.length,1)
  assert.equal(x.records[0].Territorio,gal)
  assert.equal(x.summary.excludedByReason["Otra unidad de negocio"],2)
  assert.equal(x.summary.excludedByReason["Mes fuera del periodo"],1)
})

test("El filtro original Agrícola no cambia con la nueva unidad", () => {
  const x = prepareAgricolaRows("commercial",[hCommercial,m(agr,"Persona A","Julio"),m(gal,"Persona B","Agosto")],2026,"Q3")
  assert.equal(x.records.length,1)
  assert.equal(x.records[0].Territorio,agr)
})

test("Galagro Q3: filtrar las cuatro actividades completadas por canal e ID", () => {
  const h=["ID","Estado","Tipo de visita","Propietario","Fecha/Hora de inicio","Territorio de ventas"]
  const rows=[h,["1","Completado","Día de campo","Promotora Demo","2026-07-12",gal],["2","Completado","Visita Formación","Promotora Demo","2026-08-12",gal],["3","Completado","Visita Formación","Otro","2026-09-12",agr],["4","Completado","Evento Especial","Otro","2026-09-12",nac],["5","Pendiente","Día de campo","Otro","2026-09-12",gal],["6","Completado","Visita Parcela","Otro","2026-09-12",gal]]
  const x=prepareAgricolaRows("activities",rows,2026,"Q3",{sourceKey:"GAL-ANT"})
  assert.equal(x.issues.length,0)
  assert.equal(x.records.length,2)
  assert.deepEqual(x.records.map(r=>r.ID),["1","2"])
  assert.equal(x.summary.byType["Día de campo"],1)
  assert.equal(x.summary.byType["Visita Formación"],1)
})

test("Pegar tabla también aplica el filtro Galagro", () => {
  const t=[hCommercial,m(gal,"Comercial Demo","Julio"),m(agr,"Excluido","Julio")].map(row=>row.join("\t")).join("\n")
  const x=prepareAgricolaBlock("commercial",t,2026,"Q3","GAL-ANT")
  assert.equal(x.records.length,1)
})

test("Metas Galagro nunca heredan 60 visitas fijas ni universo agrícola", () => {
  assert.equal(cfg.sourceKey,"GAL-ANT")
  assert.equal(cfg.rulesValidated,false)
  assert.equal(cfg.targets.director.coverageUniverse,null)
  assert.equal(cfg.targets.promoterVisits.methodology,"fuente")
  const blocks={
    commercial:{records:["Julio","Agosto","Septiembre"].map(mon=>({Territorio:gal,Empleado:"Comercial Demo","Meta Cobertura y Visitas":12,"Clientes Visitados":5,"Cant. Visitas":6,"Meta Clientes Recuperar":48,"Cant. Clientes Nuevos":4,Mes:mon}))},
    promoters:{records:["Julio","Agosto","Septiembre"].map(mon=>({Territorio:gal,Empleado:"Promotora Demo","Meta Cobertura":15,"Clientes Visitados":5,"Meta Visitas":20,"Cant. Visitas":10,"Meta Clientes Nuevos":5,"Cant. Clientes Nuevos":2,Mes:mon}))},
    technical:{records:[]},leads:{records:[]},farms:{records:[]},activities:{records:[{ID:"1",Estado:"Completado",Propietario:"Promotora Demo","Tipo de visita":"Día de campo","Territorio de ventas":gal,month:7,year:2026}]},
  }
  const result=buildAgricolaReports({blocks,config:cfg})
  const person=result.entities.find(e=>e.kind==="individual" && e.profile==="Promotor")
  assert.ok(person)
  const visits=person.indicators.find(i=>i.id==="ejecucion_visitas").periods.Q3
  assert.equal(visits.actual,30)
  assert.equal(visits.target,60)
  assert.equal(visits.recognizedCompliance,0.5)
  assert.equal(person.indicators.find(i=>i.id==="actividades_campo").periods.Q3.actual,1)
  assert.equal(person.reportState,"borrador")
  assert.equal(result.report,"Galagro Antioquia")
})

import test from "node:test"
import assert from "node:assert/strict"
import { activityDate, selectFieldActivities } from "../lib/field-activities.mjs"
const row = { ID: "1", Estado: "Completado", "Tipo de visita": "Día de campo", "Fecha/Hora de inicio": "2026-07-01", "Territorio de ventas": "PYC AGRÍCOLA ANT NORTE" }
const period = { year: 2026, quarter: "Q3", sourceKey: "PYC-AGR-ANT" }
test("four allowed types, finalized only", () => {
 const rows = ["Día de campo","Evento Especial","Visita Mostrador Especial","Visita Formación","Visita Comercial"].map((type,i)=>({...row,ID:String(i),"Tipo de visita":type}))
 rows.push({...row,ID:"9",Estado:"Cancelado"})
 assert.equal(selectFieldActivities(rows,period).accepted.length,4)
})
test("quarter boundaries and other channels", () => {
 const rows = ["2026-06-30","2026-07-01","2026-09-30","2026-10-01","2025-08-01"].map((date,i)=>({...row,ID:String(i),"Fecha/Hora de inicio":date}))
 rows.push({...row,ID:"8","Territorio de ventas":"GALAGRO BOYACA NAL."})
 assert.equal(selectFieldActivities(rows,period).accepted.length,2)
})
test("duplicate conflicts remove the accepted ID", () => {
 assert.equal(selectFieldActivities([row,row],period).accepted.length,1)
 const result=selectFieldActivities([row,{...row,Estado:"Cancelado"}],period)
 assert.equal(result.accepted.length,0);assert.equal(result.issues.length,1)
})
test("local dates, Excel serials and invalid dates", () => {
 assert.deepEqual(activityDate("01/07/2026 23:59"),{year:2026,month:7})
 assert.deepEqual(activityDate(46204),{year:2026,month:7})
 assert.equal(activityDate("31/02/2026"),null)
})

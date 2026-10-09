# Q3 2026 — Agrícola Antioquia desde exportados

Estado: borrador para revisión. Los informes se calculan y descargan, pero llevan la marca de borrador mientras `rulesValidated` sea `false` en `config/agricola-q3-2026.json`. Q1 y Q2 no cambian: siguen saliendo de `data/generated/individual-c4c.json`.

## Flujo

1. `/cargar-datos`: pegar cada exportado con sus encabezados o cargar el .xlsx. Seis bloques: Gestión comercial, Gestión de promotores, Técnico, Leads, Fincas y Actividades de campo (todos los canales, con las filas iniciales de C4C).
2. La página detecta encabezados (sin importar mayúsculas, tildes ni espacios), separador decimal, porcentajes y montos con `$`, filtra la unidad Agrícola Antioquia y los meses del trimestre, y muestra la conciliación: leídos, válidos, excluidos por motivo, registros por mes, celdas vacías y actividades por tipo. Cualquier observación en rojo bloquea el cálculo.
3. `/agricola-q3`: informes individuales (comerciales y promotores), por territorio y de dirección; periodos julio, agosto, septiembre y trimestre. Cada indicador muestra gestión real, meta, cumplimiento sin tope y reconocido, peso, aporte, estado (completo, parcial, sin dato, sin meta, no aplica), fuente, alcance, fórmula y observaciones.
4. Descargas: PDF del informe seleccionado, PDF con todos los informes de cada tipo y Excel de trazabilidad (resultados, trazabilidad por indicador y periodo, reglas pendientes, observaciones y conciliación).

Los datos se procesan en el navegador y quedan en `sessionStorage` de la pestaña. No se suben al servidor ni al repositorio. El catálogo de personas y territorios se arma con los exportados cargados; el repositorio solo guarda reglas, pesos y topes. El bloque opcional «Metas auxiliares» se carga junto con los seis exportados.

## Código

- `lib/agricola-import.mjs`, `lib/pasted-table.mjs`, `lib/field-activities.mjs`: lectura y normalización de los bloques.
- `lib/agricola-q3/engine.mjs`: catálogo derivado, cálculo de indicadores, resultados ponderados y conciliación. Sin dependencias de la interfaz.
- `config/agricola-q3-2026.json`: pesos, topes, metas auxiliares, políticas y reglas pendientes.
- `lib/agricola-q3/pdf-pages.ts` y `lib/pdf/export-individual-pdf.ts`: PDFs con el mismo formato del informe individual. Sin parámetros adicionales el PDF de Q1/Q2 no cambia.
- Pruebas con datos ficticios: `tests/agricola-q3-engine.test.mjs`, `tests/agricola-import.test.mjs`, `tests/field-activities.test.mjs`, `tests/auth-session.test.mjs` (`pnpm test`).

## Metodología aplicada

Las reglas de negocio aprobadas están en `approvedRules` de la configuración y se muestran en la página y en el Excel de trazabilidad.

- Catálogo: una persona tiene asignados los territorios donde su fila trae meta; las filas sin meta son visitas en otros territorios (cuentan en sus visitas, no cambian su alcance). Quien tiene meta en Dirección es el director. Nombres que empiezan por «(Vacante)» son vacantes; nombres en mayúsculas sostenidas son posiciones sin titular. Las vacantes se conservan y no se reasignan.
- Territorios: Norte y Bajo Cauca se conservan separados en la fuente y se evalúan como «Norte y Bajo Cauca» (`catalog.territoryGroups`). El informe individual solo usa gestión atribuida a la persona (sus filas, sus actividades como propietario, sus fincas); el territorial suma la gestión válida del territorio sin reasignarla; dirección consolida los territorios operativos desde la fuente, sin sumar informes.
- Pesos: visitas 10 %, cobertura 10 %, clientes nuevos 10 %, recomendaciones 20 %, referencias 10 %, leads calificados 10 %, leads a tiempo 10 %, actividades 10 %, hectáreas 5 %, cultivos 5 %. Gestión de cultivos (promedio de hectáreas y cultivos) es informativa. Suelos se muestra como No aplica, peso 0.
- Resultado: suma de aportes de los indicadores evaluados, con el peso evaluado visible. Sin dato, Sin meta y No aplica no suman; no se redistribuyen pesos ni se asigna nivel a un resultado parcial.
- Cobertura: clientes únicos por mes (Clientes Visitados); trimestre = Σ clientes únicos mensuales / Σ metas mensuales, sin dividir de nuevo entre 3. La cobertura del director queda Sin meta.
- Clientes nuevos: acumulado del trimestre; meta anual de la fuente / 4 (sin redondeo) o meta mensual × 3, según `targets.newClients`. Tope 150 %.
- Leads: numerador = cantidad real de calificados (porcentaje × Meta Leads), nunca Meta Leads; a tiempo = Calificados Oportunos; meta = leads asignados. Asignados sin gestión = 0; sin leads asignados = No aplica; un registro con porcentaje vacío pero con gestión se informa como inconsistente y no se evalúa.
- Actividades: completadas de Día de campo, Evento Especial, Visita Mostrador Especial y Visita Formación, por fecha de inicio en el trimestre, una vez por ID, sin parcelas; un ID repetido con datos distintos se excluye y se informa. Propietarios sin correspondencia en el catálogo se informan y cuentan en su territorio.
- Metas de actividades, hectáreas y cultivos: no hay metas globales. Solo se evalúan con el bloque opcional «Metas auxiliares» (Nombre, Meta Actividades Trimestre, Meta Hectáreas Mes, Meta Cultivos Mes), que se carga como los exportados y no se guarda en el repositorio. Las vacantes y posiciones sin titular no reciben meta.
- Fincas: hectáreas y cultivos impactados solo de la fuente de fincas; sin identificador de finca, la suma no se presenta como fincas o cultivos únicos.
- Celdas vacías: dato ausente, nunca cero. Si todo el alcance está vacío el indicador queda sin dato.
- Referencias: cantidad = Meta Referencias × proporción recomendada. Al pegar, si la proporción no tiene decimales suficientes para una cantidad exacta, la carga se bloquea.
- Dirección y Dirección Técnica del exportado técnico solo repiten Meta Referencias y se excluyen del consolidado.

## Reglas pendientes de validación

Están en `pendingRules` de la configuración y se muestran en la página y en los PDF: fuente de clientes nuevos (la meta comercial se llama «Meta Clientes Recuperar»), atribución del exportado técnico (no trae persona), referencias, metas auxiliares, celdas vacías, alcance y metas del director (20 visitas mensuales de la plantilla histórica) y peso de los indicadores No aplica. Al validarlas: ajustar la configuración, poner `rulesValidated: true` y volver a revisar las pruebas.

## Galagro (pendiente)

Galagro Antioquia y Galagro Nacional siguen con el flujo de libros Excel (`config/q3-preparation.json`, `scripts/preflight-q3.mjs`). Pendientes conocidos de ese flujo: reglas Q3 en `data/configuracion-c4c.json`, condiciones `source.quarter === "Q2"` en `expand-galagro-nacional-team.mjs`, metadatos Q1 reutilizados en `normalize-galagro-nacional-indicators.mjs` y visitas fijas del director nacional en `build-galagro-nacional-director.mjs`. No ejecutar `refresh-dashboard` ni `refresh:data` para ensayos: escriben datos y pueden desplegar.

## Datos publicados

El repositorio es público y contiene Excel históricos en `data/` (`.gitignore` no retira archivos ya versionados). La contraseña del sitio no los protege. Recomendación: hacer privado el repositorio y, si corresponde, retirar esos archivos del historial. No agregar exportados ni catálogos de personas al repositorio.

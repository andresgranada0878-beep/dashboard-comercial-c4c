# Q3 2026 — Agrícola Antioquia desde exportados

Estado: borrador para revisión. Los informes se calculan y descargan, pero llevan la marca de borrador mientras `rulesValidated` sea `false` en `config/agricola-q3-2026.json`. Q1 y Q2 no cambian: siguen saliendo de `data/generated/individual-c4c.json`.

## Flujo

1. `/cargar-datos`: pegar cada exportado con sus encabezados o cargar el .xlsx. Seis bloques: Gestión comercial, Gestión de promotores, Técnico, Leads, Fincas y Actividades de campo (todos los canales, con las filas iniciales de C4C).
2. La página detecta encabezados (sin importar mayúsculas, tildes ni espacios), separador decimal, porcentajes y montos con `$`, filtra la unidad Agrícola Antioquia y los meses del trimestre, y muestra la conciliación: leídos, válidos, excluidos por motivo, registros por mes, celdas vacías y actividades por tipo. Cualquier observación en rojo bloquea el cálculo.
3. `/agricola-q3`: informes individuales (comerciales y promotores), por territorio y de dirección; periodos julio, agosto, septiembre y trimestre. Cada indicador muestra gestión real, meta, cumplimiento sin tope y reconocido, peso, aporte, estado (completo, parcial, sin dato, sin meta), fuente, alcance, fórmula y observaciones.
4. Descargas: PDF del informe seleccionado, PDF con todos los informes de cada tipo y Excel de trazabilidad (resultados, trazabilidad por indicador y periodo, reglas pendientes, observaciones y conciliación).

Los datos se procesan en el navegador y quedan en `sessionStorage` de la pestaña. No se suben al servidor ni al repositorio. El catálogo de personas y territorios se arma con los exportados cargados; el repositorio solo guarda reglas y metas auxiliares.

## Código

- `lib/agricola-import.mjs`, `lib/pasted-table.mjs`, `lib/field-activities.mjs`: lectura y normalización de los bloques.
- `lib/agricola-q3/engine.mjs`: catálogo derivado, cálculo de indicadores, resultados ponderados y conciliación. Sin dependencias de la interfaz.
- `config/agricola-q3-2026.json`: pesos, topes, metas auxiliares, políticas y reglas pendientes.
- `lib/agricola-q3/pdf-pages.ts` y `lib/pdf/export-individual-pdf.ts`: PDFs con el mismo formato del informe individual. Sin parámetros adicionales el PDF de Q1/Q2 no cambia.
- Pruebas con datos ficticios: `tests/agricola-q3-engine.test.mjs`, `tests/agricola-import.test.mjs`, `tests/field-activities.test.mjs`, `tests/auth-session.test.mjs` (`pnpm test`).

## Metodología aplicada

- Catálogo: una persona tiene asignados los territorios donde su fila trae meta; las filas sin meta son visitas en otros territorios (cuentan en sus visitas, no cambian su alcance). Quien tiene meta en Dirección es el director. Nombres que empiezan por «(Vacante)» son vacantes; nombres en mayúsculas sostenidas son posiciones sin titular. Las vacantes se conservan y no se reasignan.
- Pesos: visitas 10 %, cobertura 10 %, clientes nuevos 10 %, recomendaciones 20 %, referencias 10 %, leads calificados 10 %, leads a tiempo 10 %, actividades 10 %, hectáreas 5 %, cultivos 5 %. Gestión de cultivos (promedio de hectáreas y cultivos) es informativa.
- Resultado: suma de aportes de los indicadores con dato. Si falta alguno, el resultado se marca parcial y se muestra el peso evaluado; no se asigna nivel de desempeño.
- Celdas vacías: dato ausente, nunca cero. Si todo el alcance está vacío el indicador queda sin dato.
- Referencias: cantidad = Meta Referencias × proporción recomendada. Al pegar, si la proporción no tiene decimales suficientes para una cantidad exacta, la carga se bloquea.
- Leads: cantidad calificada = porcentaje × Meta Leads; meta mensual = máximo(1, Meta Leads). Un empleado sin registros queda sin dato. No se supone que calificados = oportunos + fuera de tiempo.
- Actividades: completadas de Día de campo, Evento Especial, Visita Mostrador Especial y Visita Formación, por fecha de inicio en el trimestre, una vez por ID; un ID repetido con datos distintos se excluye y se informa. Propietarios sin correspondencia en el catálogo se informan y cuentan en su territorio.
- Fincas: sin identificador de finca; la suma de hectáreas o registros no se presenta como fincas o cultivos únicos.
- Dirección y Dirección Técnica del exportado técnico solo repiten Meta Referencias y se excluyen del consolidado.

## Reglas pendientes de validación

Están en `pendingRules` de la configuración y se muestran en la página y en los PDF: periodicidad de la meta de cobertura, metas de visitas, clientes nuevos (meta anual / 4, acumulado, tope), referencias, leads, metas de actividades y fincas (incluidas vacantes y parcelas), atribución territorial (incluido Norte / Bajo Cauca), celdas vacías, alcance y metas del director (no hay meta de cobertura del director en el exportado) y Suelos (sin fuente). Al validarlas: ajustar la configuración, poner `rulesValidated: true` y volver a revisar las pruebas.

## Galagro (pendiente)

Galagro Antioquia y Galagro Nacional siguen con el flujo de libros Excel (`config/q3-preparation.json`, `scripts/preflight-q3.mjs`). Pendientes conocidos de ese flujo: reglas Q3 en `data/configuracion-c4c.json`, condiciones `source.quarter === "Q2"` en `expand-galagro-nacional-team.mjs`, metadatos Q1 reutilizados en `normalize-galagro-nacional-indicators.mjs` y visitas fijas del director nacional en `build-galagro-nacional-director.mjs`. No ejecutar `refresh-dashboard` ni `refresh:data` para ensayos: escriben datos y pueden desplegar.

## Datos publicados

El repositorio es público y contiene Excel históricos en `data/` (`.gitignore` no retira archivos ya versionados). La contraseña del sitio no los protege. Recomendación: hacer privado el repositorio y, si corresponde, retirar esos archivos del historial. No agregar exportados ni catálogos de personas al repositorio.

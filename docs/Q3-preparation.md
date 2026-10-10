# Q3 2026 — Agrícola Antioquia desde exportados

Estado: borrador para revisión. Los informes se calculan y descargan, pero llevan la marca de borrador mientras `rulesValidated` sea `false` en `config/agricola-q3-2026.json`. Q1 y Q2 no cambian: siguen saliendo de `data/generated/individual-c4c.json`.

## Flujo

1. `/cargar-datos`: pegar cada exportado con sus encabezados o cargar el .xlsx. Seis bloques: Gestión comercial, Gestión de promotores, Técnico, Leads, Fincas y Actividades de campo (todos los canales, con las filas iniciales de C4C).
2. La página detecta encabezados (sin importar mayúsculas, tildes ni espacios), separador decimal, porcentajes y montos con `$`, filtra la unidad Agrícola Antioquia y los meses del trimestre, y muestra la conciliación: leídos, válidos, excluidos por motivo, registros por mes, celdas vacías y actividades por tipo. Cualquier observación en rojo bloquea el cálculo.
3. `/agricola-q3`: informes individuales (comerciales y promotores), por territorio y de dirección; periodos julio, agosto, septiembre y trimestre. Cada indicador muestra gestión real, meta, cumplimiento sin tope y reconocido, peso, aporte, estado (completo, parcial, sin dato, sin meta, no aplica), fuente, alcance, fórmula y observaciones.
4. Descargas: PDF del informe seleccionado, PDF con todos los informes de cada tipo y Excel de trazabilidad (resultados, trazabilidad por indicador y periodo, reglas pendientes, observaciones y conciliación).

Los datos se procesan en el navegador y quedan en `sessionStorage` de la pestaña. No se suben al servidor ni al repositorio. El catálogo de personas y territorios se arma con los exportados cargados; el repositorio solo guarda reglas, pesos y topes.

## Código

- `lib/agricola-import.mjs`, `lib/pasted-table.mjs`, `lib/field-activities.mjs`: lectura y normalización de los bloques.
- `lib/agricola-q3/engine.mjs`: catálogo derivado, cálculo de indicadores, resultados ponderados y conciliación. Sin dependencias de la interfaz.
- `config/agricola-q3-2026.json`: pesos, topes, metas por promotor activo, políticas, reglas aprobadas y pendientes.
- `lib/agricola-q3/pdf-pages.ts` y `lib/pdf/export-individual-pdf.ts`: PDFs con el mismo formato del informe individual. Sin parámetros adicionales el PDF de Q1/Q2 no cambia.
- Pruebas con datos ficticios: `tests/agricola-q3-engine.test.mjs`, `tests/agricola-import.test.mjs`, `tests/field-activities.test.mjs`, `tests/auth-session.test.mjs` (`pnpm test`).

## Metodología aplicada

Las reglas de negocio aprobadas están en `approvedRules` de la configuración y se muestran en la página y en el Excel de trazabilidad.

- Catálogo: una persona tiene asignados los territorios donde su fila trae meta; las filas sin meta son visitas en otros territorios (cuentan en sus visitas, no cambian su alcance). Quien tiene meta en Dirección es el director. Nombres que empiezan por «(Vacante)» son vacantes; nombres en mayúsculas sostenidas son posiciones sin titular. Las vacantes se conservan y no se reasignan.
- Territorios: Norte y Bajo Cauca se conservan separados en la fuente y se evalúan como «Norte y Bajo Cauca» (`catalog.territoryGroups`). El informe territorial suma la gestión válida del territorio sin reasignarla; dirección consolida los territorios operativos desde la fuente, sin sumar informes.
- Origen de la gestión (columna «Origen» en la página, el PDF y el Excel): «Personal» para visitas, cobertura, leads y, en promotores, actividades y fincas a su nombre. «Territorio asignado» para recomendaciones y referencias de cualquier individual (el exportado técnico no trae persona) y para actividades, hectáreas y cultivos de los comerciales. No es gestión personal directa: el informe territorial usa exactamente la misma gestión.
- Pesos: visitas 10 %, cobertura 10 %, recuperación de clientes 10 %, recomendaciones 20 %, referencias 10 %, leads calificados 10 %, leads a tiempo 10 %, actividades 10 %, hectáreas 5 %, cultivos 5 %. Gestión de cultivos (promedio de hectáreas y cultivos) es informativa. Suelos se muestra como No aplica, peso 0.
- Resultado: dos valores, sin redistribuir pesos. A) Aporte ponderado sobre 100 = suma de aportes de los indicadores evaluados. B) Cumplimiento normalizado = aporte / peso evaluado (por ejemplo 41,4 / 70 % = 59,1 %). Sin dato, Sin meta y No aplica no suman. Si el peso evaluado es menor a 100 % o a algún indicador le falta un mes de filas en la fuente, el resultado es PARCIAL y no tiene nivel de desempeño.
- Cobertura: clientes únicos por mes (Clientes Visitados); trimestre = Σ clientes únicos mensuales / Σ metas mensuales, sin dividir de nuevo entre 3. Promotores: meta individual mensual = Meta Cobertura del territorio / plazas de promotor asignadas al territorio (titulares + vacantes vigentes, es decir, con meta de cobertura en el exportado del trimestre); la gestión personal no se divide. Vacante = No aplica, cuenta en el divisor y su parte no se redistribuye. No se infiere inactividad por gestión cero (0 % contra la meta); un mes sin filas conserva la meta y se marca para revisión. El territorio conserva la meta completa.
- Director: meta de 20 visitas mensuales (metodología Q1/Q2; el 1 del exportado no se usa). Cobertura histórica = universo de clientes del alcance / 12 por mes (Q1/Q2: 416 / 12 = 34,67); el exportado Q3 no trae ese universo, así que queda Sin meta hasta tenerlo (`targets.director.coveragePerMonth`).
- Recuperación de clientes (nuevos + recuperados): acumulado del trimestre de «Cant. Clientes Nuevos» contra «Meta Clientes Recuperar» / 4 (comerciales, sin redondeo). Promotores, por continuidad con la regla publicada en Q1/Q2: cumplimiento = MIN(150 %, «Cant. Clientes Nuevos» del exportado Q3 tal como llega / 90), con 90 = meta base 30 × 3 del dashboard publicado (`targets.newClients.promoters.quarterTarget`); no se usa /30 ni /270 (el /3 de Q2 venía de la plantilla fuente). La fuente Q3 presenta una escala diferente frente a periodos anteriores; se conserva el dato de origen para revisión futura. Vacantes = No aplica. Tope 150 %. Advertencia que no bloquea el cálculo: «La fuente no permite verificar si la medida incluye clientes recuperados.» No se suman recuperados supuestos.
- Leads (fórmula publicada Q1/Q2): calificados = Σ Meta Leads de las filas del titular en el mes (no porcentaje × Meta Leads); a tiempo = Σ Calificados Oportunos; meta mensual = mayor entre 1 y Meta Leads para ambos (mínimo 3 en el trimestre). Un mes sin filas = 0 contra 1; un titular sin leads queda 0 / 3 y conserva el peso, nunca No aplica por falta de registros. Vacantes y posiciones sin titular = No aplica: sus filas quedan en la fuente y en las notas («Registro asociado a usuario de vacante; excluido del cálculo…») pero no suman numerador ni meta en el individual ni en el territorio. Territorio = suma de los titulares con territorio asignado.
- Actividades: completadas de Día de campo, Evento Especial, Visita Mostrador Especial y Visita Formación, por fecha de inicio en el trimestre, una vez por ID, sin parcelas; un ID repetido con datos distintos se excluye y se informa. Propietarios sin correspondencia en el catálogo se informan y cuentan en su territorio.
- Metas de actividades, hectáreas y cultivos (`targets.fieldTargets`): por promotor activo y trimestre, 3 actividades, 90 hectáreas (30 al mes) y 3 cultivos (1 al mes); las parcelas no cuentan en Q3. Las vacantes y posiciones sin titular no generan meta. Territorio = meta individual × promotores activos asignados (sin promotores activos: Sin meta). RTC (comercial) = gestión y meta de su territorio asignado, mostrado como «Alcance: territorio asignado», nunca como autoría individual. Dirección = suma de las metas territoriales.
- Fincas: hectáreas y cultivos impactados solo de la fuente de fincas; sin identificador de finca, la suma no se presenta como fincas o cultivos únicos.
- Celdas vacías (regla SUMIFS Q1/Q2): si la fila del territorio, persona y mes existe y la gestión viene vacía, cuenta como 0 y no deja el indicador Parcial ni Sin dato. Sin dato solo cuando falta la fila, la fuente o la información para calcular. Vacantes y posiciones sin titular: el vacío queda No aplica, no 0 %. Un territorio sin titular activo (p. ej. Urabá Q3) queda No aplica en todos los indicadores.
- Referencias: cantidad = Meta Referencias × proporción recomendada. Al pegar, si la proporción no tiene decimales suficientes para una cantidad exacta, la carga se bloquea.
- Dirección y Dirección Técnica del exportado técnico solo repiten Meta Referencias y se excluyen del consolidado.

## Reglas pendientes de validación

Están en `pendingRules` de la configuración y se muestran en la página y en los PDF: referencias (conteo por mes sin código de referencia) y universo de clientes del director para la cobertura. Al validarlas: ajustar la configuración, poner `rulesValidated: true` y volver a revisar las pruebas.

## Galagro (pendiente)

Galagro Antioquia y Galagro Nacional siguen con el flujo de libros Excel (`config/q3-preparation.json`, `scripts/preflight-q3.mjs`). Pendientes conocidos de ese flujo: reglas Q3 en `data/configuracion-c4c.json`, condiciones `source.quarter === "Q2"` en `expand-galagro-nacional-team.mjs`, metadatos Q1 reutilizados en `normalize-galagro-nacional-indicators.mjs` y visitas fijas del director nacional en `build-galagro-nacional-director.mjs`. No ejecutar `refresh-dashboard` ni `refresh:data` para ensayos: escriben datos y pueden desplegar.

## Datos publicados

El repositorio es público y contiene Excel históricos en `data/` (`.gitignore` no retira archivos ya versionados). La contraseña del sitio no los protege. Recomendación: hacer privado el repositorio y, si corresponde, retirar esos archivos del historial. No agregar exportados ni catálogos de personas al repositorio.

# Preparación Q3 2026 — pendiente de fuentes y validación

Revisión del commit 7a69295a8279e24be6ba71608294f77e30f9be00. Esta propuesta no cambia la configuración activa, el JSON servido, la interfaz ni el workflow de producción.

## Flujo existente

Power BI → exportación Excel → carpeta Drive → sync-drive.mjs → build:data (seis scripts) → data/generated/individual-c4c.json → API y dashboard.
No existe conexión directa autenticada a Power BI en este flujo.
La actualización de GitHub está programada cada 15 minutos y escribe en la rama donde se ejecuta; no ejecutarla para ensayar Q3 en producción.

## Archivos que se necesitan

Los cuatro nombres y hojas mínimas están en config/q3-preparation.json.
Exportar cada informe con filtros de julio, agosto y septiembre de 2026, preservando hojas base, fórmulas y valores recalculados de la plantilla existente. Un Excel de datos de un solo visual no sustituye estos libros.
Conservar Q1 y Q2. Guardar las nuevas fuentes en data/fuentes o en la carpeta Drive configurada.

Comprobación de estructura, sin escribir datos:
```sh
node scripts/preflight-q3.mjs
```
La comprobación no evalúa fórmulas ni certifica exactitud; tampoco activa Q3.

## Cambios pendientes antes de incorporar Q3

1. Añadir cuatro fuentes en source_rows y reglas Q3 verificadas en rules_rows de data/configuracion-c4c.json. No copiar cachedCompliance, resultados o metas históricas como valores Q3.
2. Registrar referencias Q3 de result_rows contra los resultados recalculados de Excel.
3. Revisar las condiciones source.quarter === "Q2" de expand-galagro-nacional-team.mjs: Q3 actualmente cae en otras ramas. Confirmar sus reglas con los libros Q3.
4. Revisar normalize-galagro-nacional-indicators.mjs: reutiliza pesos y metadatos Q1 en otros periodos; confirmar vigencia para Q3.
5. Sustituir las visitas propias fijas del director nacional en build-galagro-nacional-director.mjs ([18,10,17] y [14,16,11]) por una fuente verificable por año y trimestre. Solo genera Q1 y Q2 actualmente.
6. Hacer que build-individual-data.mjs falle antes de escribir si hay fuentes incompletas; actualmente escribe el payload con errors.
7. Actualizar el texto Q1–Q2 de dashboard-shell.tsx cuando los datos Q3 estén verificados. Sus selectores ya derivan Q3 del JSON.
8. Mantener los ensayos en una copia aislada; el workflow actual hace git push y puede disparar el despliegue conectado.

## Validación y aceptación

- Cuatro libros completos y fechas Q3 2026 verificadas en las hojas base.
- Resultados de comerciales, promotores y directores contrastados contra Excel; distinguir cálculos derivados de resultados de referencia.
- Revisar acumulados de clientes nuevos, sumas/promedios, metas, pesos y topes por perfil.
- No admitir periodos o perfiles incompletos ni usar ceros para suplir una fuente ausente.
- Generar fuera de producción, ejecutar validate-generated-data.mjs y comparar Q1/Q2 con la versión anterior sin cambios numéricos.
- Probar selección Q3, meses julio–septiembre y PDFs; ejecutar compilación antes de proponer incorporación.
- Aprobar y fusionar solo tras completar fuentes y validaciones. Este borrador no es una implementación Q3 terminada.

## Datos publicados

Hay Excel ya rastreados en data/ pese a las reglas de .gitignore y a lo indicado por README. .gitignore no elimina archivos previamente versionados. Revisar acceso al repositorio y exposición histórica de datos comerciales; no incluir nuevas fuentes Excel en este PR.


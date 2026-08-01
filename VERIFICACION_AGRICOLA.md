# Corrección de carga del equipo Agrícola Antioquia

Esta actualización reemplaza conjuntamente:

- El endpoint `/api/dashboard-data`.
- El JSON procesado con el equipo completo.
- El componente del tablero.
- Los tipos del modelo.
- Los logos corporativos.

Conteos incluidos en `data/generated/individual-c4c.json`:

- Agrícola Antioquia: 36 registros persona-periodo.
- Comercial: 7 personas en Q1 y 7 en Q2.
- Promotor: 11 personas/posiciones en Q1 y 11 en Q2.
- Total Agrícola Antioquia: 18 personas/posiciones únicas.

No ejecute `npm run build:data` después de aplicar esta corrección, salvo que los ocho Excel estén completos dentro de `data/fuentes`.

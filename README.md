# Dashboard individual C4C

Primera fase del portal de indicadores C4C. Se concentra únicamente en resultados individuales de:

- Agrícola Antioquia.
- Galagro Antioquia.
- Galagro Nacional, comerciales.
- Galagro Nacional, promotores.

Incluye vista trimestral validada contra los archivos Excel y una vista mensual derivada con las reglas de cada indicador.

## Ejecutar

```bash
npm install
npm run dev
```

## Datos usados por la página

La aplicación consume:

```text
data/generated/individual-c4c.json
```

Ese JSON ya está incluido y permite desplegar la aplicación sin publicar los Excel originales.

## Regenerar los datos desde los Excel

1. Colocar los ocho archivos fuente en `data/fuentes/` con estos nombres:

```text
informe Q1 - Final.xlsx
informe Q2 - Final.xlsx
informe Q1 - Galagro Ant Final.xlsx
informe Q2 - Galagro Ant Final.xlsx
informe Q1 - Galagro Nacional.xlsx
informe Q2 - Galagro Nacional.xlsx
informe Q1 - Galagro Nacional - Promotor.xlsx
informe Q2 - Galagro Nacional - Promotor.xlsx
```

2. Ejecutar:

```bash
npm run build:data
```

3. Confirmar que los ocho resultados indiquen `Coincide`.

Los Excel están ignorados por Git. No deben publicarse en el repositorio ni quedar accesibles desde `public/`.

## Alcance pendiente

- Conexión autenticada con los tres modelos de Power BI.
- Inclusión de todos los colaboradores, no solo los casos guardados en los Excel de validación.
- Reportes de director y territorio.
- Descarga en PDF.

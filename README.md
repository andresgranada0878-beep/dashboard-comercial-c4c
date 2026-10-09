# Dashboard individual C4C

Primera fase del portal de indicadores C4C. Se concentra únicamente en resultados individuales de:

- Agrícola Antioquia.
- Galagro Antioquia.
- Galagro Nacional, comerciales.
- Galagro Nacional, promotores.

Incluye vista trimestral validada contra los archivos Excel y una vista mensual derivada con las reglas de cada indicador.

## Ejecutar

```bash
pnpm install
pnpm dev
pnpm test
```

## Acceso

Todas las páginas, la API y las descargas exigen sesión. La contraseña se valida en el servidor (`proxy.ts` y `app/api/auth/login`) contra un hash scrypt; la sesión es una cookie firmada HttpOnly, Secure y SameSite=Lax que dura 8 horas. Sin las dos variables siguientes el sitio responde 503 (falla cerrado):

```text
AUTH_PASSWORD_HASH   hash de la contraseña (generar con: node scripts/hash-password.mjs)
AUTH_SECRET          secreto de firma de sesiones (lo genera el mismo script)
```

En local se guardan en `.env.local` (ignorado por Git). En Vercel se configuran como variables de entorno del entorno correspondiente (Preview o Production). Cambiar `AUTH_SECRET` cierra todas las sesiones.

La contraseña no protege archivos que estén en el repositorio público de GitHub: los Excel históricos de `data/` siguen siendo visibles allí mientras el repositorio sea público.

## Agrícola Antioquia Q3

`/cargar-datos` recibe los seis exportados de Power BI y C4C (pegados o en .xlsx) y `/agricola-q3` muestra los informes individuales, por territorio y de dirección, mensuales y trimestrales, con descarga en PDF y Excel de trazabilidad. Los datos se procesan en el navegador y quedan solo en la pestaña (sessionStorage); no se envían al servidor ni se guardan en el repositorio. Metodología y reglas pendientes: `docs/Q3-preparation.md`.

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
- Inclusión de todos los colaboradores en Q1/Q2, no solo los casos guardados en los Excel de validación.
- Validación de las reglas Q3 marcadas como pendientes y extensión del flujo de carga a Galagro.

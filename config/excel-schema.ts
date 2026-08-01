import type { IndicatorKey } from "@/types/dashboard"

// Esquema esperado del archivo Excel. Permite detectar hojas y columnas faltantes
// sin acoplar la lectura a nombres exactos (se normalizan al comparar).
export const EXPECTED_SHEETS = [
  "base director",
  "Tabla dinam gestion comercial",
  "Tecnico",
  "Fincas",
  "Territorios",
  "Act Campo",
  "Leads",
  "Resumen ejecutivo",
] as const

export const OPTIONAL_SHEETS = ["Trimestre", "X territorio", "mensual", "Director"] as const

export const SHEET_ALIASES = [
  "base director",
  "tabla dinam gestion comercial",
  "tecnico",
  "fincas",
  "territorios",
  "act campo",
  "leads",
  "resumen ejecutivo",
  "trimestre",
  "x territorio",
  "mensual",
  "director",
] as const

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  "base director": ["Comercial", "Indicador", "Cumplimiento", "Meta", "Peso", "Meta Esperada"],
  "Tabla dinam gestion comercial": ["Empleado", "Comercial", "Territorio", "Empresa", "Mes", "Cargo"],
  Leads: ["Territorio", "Unidad de Negocio", "Empleado", "Mes"],
  Territorios: ["Territorio de ventas", "Ciudad", "Encargado"],
  "Act Campo": ["ID", "Cliente", "Territorio de ventas", "Organización de ventas"],
  "Resumen ejecutivo": ["valor", "nombre", "Mensaje"],
  Tecnico: ["Territorio", "Ppto", "Valor Recomendaciones", "Meta Referencias", "Mes"],
  Fincas: ["Unidad de Negocio", "des_territorio", "atr_desc_empleado", "Héctareas", "Mes"],
}

/**
 * Mapea el nombre del indicador tal como aparece en la hoja "base director"
 * a la clave canónica. La comparación se hace normalizada (sin acentos/mayúsculas).
 */
export const INDICATOR_NAME_TO_KEY: { match: string; key: IndicatorKey }[] = [
  { match: "ejecucion visitas", key: "ejecucionVisitas" },
  { match: "cobertura clientes", key: "coberturaClientes" },
  { match: "nuevos clientes", key: "nuevosClientes" },
  { match: "recomendados", key: "recomendaciones" },
  { match: "recomendaciones", key: "recomendaciones" },
  { match: "referencias", key: "referencias" },
  { match: "leads calificados a tiempo", key: "leadsCalificadosATiempo" },
  { match: "leads calificados", key: "leadsCalificados" },
  { match: "impacto en clientes", key: "impactoClientes" },
  { match: "hectareas cultivos impactados", key: "hectareasCultivos" },
  { match: "cultivos impactados", key: "cultivosImpactados" },
]

// Errores de Excel que deben convertirse en nulos.
export const EXCEL_ERROR_VALUES = ["#VALUE!", "#DIV/0!", "#NAME?", "#N/A", "#REF!", "#NULL!", "#NUM!"]

// Ruta por defecto del directorio de archivos Excel. Los nombres reales se detectan dinámicamente.
export const DEFAULT_EXCEL_PATH = "data"
export const DEFAULT_EXCEL_NAME = "excel"

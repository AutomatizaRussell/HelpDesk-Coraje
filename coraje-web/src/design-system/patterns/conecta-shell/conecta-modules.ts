/**
 * Módulos de Conecta que deciden qué entradas de su menú ve cada persona.
 *
 * Conecta calcula en su backend la lista efectiva de módulos de cada empleado
 * (`core.permisos.permisos_de`) y la guarda en `gct_empleado.permisos`; su
 * sidebar solo pregunta `puede(clave)` (RBGCT-REACT `lib/permisos.js`,
 * `RoleSidebar.jsx`). HelpDesk lee esa misma lista en `/ingreso` y conserva
 * **solo** estas claves: las que su réplica del menú necesita.
 *
 * Vive aparte del menú para que el servidor (`server/auth/entry-context.ts`)
 * la importe sin arrastrar los iconos del shell.
 *
 * Fuera a propósito:
 * - `eeff` (Analitica): Conecta solo muestra el acceso si se compiló con
 *   `VITE_EEFF_URL`, y esa dirección no se conoce desde aquí.
 * - Las de editor y administración: HelpDesk replica solo el menú de empleado
 *   (specs/integracion-conecta.md §6.1).
 */
export const CONECTA_MENU_MODULES = [
  "sqf",
  "seguimiento_facturacion",
  "tesoreria_ver",
  "tesoreria_admin_ver",
  "audithub",
] as const;

export type ConectaModule = (typeof CONECTA_MENU_MODULES)[number];

/** Se queda con las claves que el menú usa, sin repetir y en orden estable. */
export function pickConectaModules(keys: readonly string[]): ConectaModule[] {
  return CONECTA_MENU_MODULES.filter((module) => keys.includes(module));
}

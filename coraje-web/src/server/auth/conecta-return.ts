import { portalPublicOrigin } from "@/server/security/portal-host";

import { APP_BASE_PATH } from "./base-path";

/**
 * URLs absolutas de HelpDesk y de Conecta, para lo que sale de la aplicación:
 * la vuelta a Conecta al cerrar sesión y los enlaces de los correos.
 *
 * Un solo origen, fijo, a propósito:
 * - HelpDesk vive en el mismo origen que Conecta, bajo `/helpdesk` (D7).
 * - `redirect()` antepone el `basePath` a una ruta relativa, así que `/app`
 *   acabaría en `/helpdesk/app`: hace falta la URL absoluta.
 * - Derivar el origen de las cabeceras `Host` / `X-Forwarded-Host` de la
 *   petición lo convertiría en una redirección abierta, y en correos con
 *   enlaces a donde diga una cabecera falsa.
 */
export const PUBLIC_ORIGIN = "https://conecta.rbgct.cloud";

/**
 * A dónde vuelve la persona al cerrar su sesión de HelpDesk: a la raíz del
 * portal de empleados de Conecta (`conecta-navigation.ts`, «Mi resumen»).
 *
 * HelpDesk tiene que ser —o parecer— parte de Conecta
 * (docs/contexto-canonico.md §1.1): cerrar sesión aquí devuelve al portal del
 * que cuelga, no a la pantalla de ingreso de HelpDesk. Decisión del
 * 25-sep-2026, para los dos modos de entrada. Quien entró directo y no tiene
 * sesión de Conecta verá allí el ingreso de Conecta.
 */
export const CONECTA_HOME_URL = `${PUBLIC_ORIGIN}/app`;

/** Enlace absoluto al detalle de un ticket, para los correos. */
export function publicTicketUrl(idTicket: string): string {
  return `${PUBLIC_ORIGIN}${APP_BASE_PATH}/tickets/${encodeURIComponent(idTicket)}`;
}

/** Enlace absoluto a «Requiere tu atención», para el correo de escalamiento (U15). */
export function publicNoticesUrl(): string {
  return `${PUBLIC_ORIGIN}${APP_BASE_PATH}/avisos`;
}

/**
 * Enlace absoluto a una ruta del portal de clientes (`/portal/...`), para los
 * correos que reciben los contactos. En el dominio propio del portal si está
 * configurado (U18, `portal-host.ts`); si no, en el de Conecta. Nunca de una
 * cabecera de la petición: un enlace de activación armado con ella mandaría
 * al cliente a donde dijera esa cabecera.
 */
export function publicPortalUrl(pathname: `/portal${string}`): string {
  return `${portalPublicOrigin() ?? PUBLIC_ORIGIN}${APP_BASE_PATH}${pathname}`;
}

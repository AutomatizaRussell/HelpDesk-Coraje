import { CONECTA_ORIGIN, directPublicOrigin, isDirectEntry } from "@/server/security/public-origins";

import { APP_BASE_PATH } from "./base-path";

/**
 * URLs absolutas de HelpDesk y de Conecta, para lo que sale de la aplicación:
 * la vuelta al cerrar sesión y los enlaces de los correos.
 *
 * Los enlaces de los correos van siempre al origen de Conecta:
 * - HelpDesk vive en el mismo origen que Conecta, bajo `/helpdesk` (D7), y ese
 *   es el camino de todos los días; el dominio directo es un salvavidas
 *   (`public-origins.ts`).
 * - `redirect()` antepone el `basePath` a una ruta relativa, así que `/app`
 *   acabaría en `/helpdesk/app`: hace falta la URL absoluta.
 * - Derivar el origen de las cabeceras `Host` / `X-Forwarded-Host` de la
 *   petición lo convertiría en una redirección abierta, y en correos con
 *   enlaces a donde diga una cabecera falsa.
 */
export const PUBLIC_ORIGIN = CONECTA_ORIGIN;

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

/**
 * A dónde lleva el cierre de sesión según el dominio por el que se entró.
 *
 * Por Conecta, a Conecta (`CONECTA_HOME_URL`). Por el dominio directo (U20), a
 * su propio ingreso: ese dominio existe para cuando Conecta no responde, y
 * mandar allí a la persona al salir la dejaría en una página caída. La
 * cabecera solo elige entre los dos orígenes conocidos (`isDirectEntry`).
 */
export function signOutDestination(headers: Headers): string {
  const direct = directPublicOrigin();
  return direct !== null && isDirectEntry(headers) ? `${direct}${APP_BASE_PATH}/login` : CONECTA_HOME_URL;
}

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
 * correos que reciben los contactos. Nunca de una cabecera de la petición: un
 * enlace de activación armado con ella mandaría al cliente a donde dijera esa
 * cabecera. Con el portal desconectado (U20) no se emiten invitaciones, pero
 * responder un ticket que ya vino del portal sigue avisando al contacto, y el
 * enlace lleva a una ruta que responde 404 hasta que se reconecte.
 */
export function publicPortalUrl(pathname: `/portal${string}`): string {
  return `${PUBLIC_ORIGIN}${APP_BASE_PATH}${pathname}`;
}

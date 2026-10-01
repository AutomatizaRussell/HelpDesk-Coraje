import { APP_BASE_PATH } from "@/server/auth/base-path";
import { logEvent } from "@/server/observability/log";

import { isPublicAssetPath } from "./public-assets";
import { isPortalPath } from "./public-paths";

/**
 * Dominio propio del portal de clientes (U18, decisión del usuario del
 * 01-oct-2026: `soporte.rbgct.cloud`).
 *
 * Los empleados siguen en `conecta.rbgct.cloud/helpdesk`: la entrada sin
 * clics lee el perfil de Conecta del `localStorage`, que solo existe en su
 * origen (contexto-canonico.md §1.1). Los clientes salen de ahí por dos
 * razones: no saben qué es Conecta, y compartir origen con la intranet le da
 * al portal externo el mismo almacenamiento del navegador que los empleados.
 *
 * El dominio llega por `PORTAL_PUBLIC_ORIGIN` y no de las cabeceras de la
 * petición, igual que `PUBLIC_ORIGIN` (`conecta-return.ts`): un enlace de
 * correo armado con una cabecera mandaría al cliente a donde ella dijera.
 * Sin la variable, el portal sigue en el origen de Conecta, como antes: así
 * esto se despliega antes de que existan el DNS y el certificado, y se activa
 * creando la variable.
 */

const PORTAL_ORIGIN_VARIABLE = "PORTAL_PUBLIC_ORIGIN";

/**
 * El origen del portal (`https://soporte.rbgct.cloud`), o `null` si no está
 * configurado. Un valor mal escrito se ignora con un registro, en vez de
 * tumbar el perímetro: sin portal propio, la aplicación sigue funcionando
 * como hasta ahora, y el error queda a la vista en el registro.
 */
export function portalPublicOrigin(): string | null {
  const raw = process.env[PORTAL_ORIGIN_VARIABLE]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Solo el origen: ni ruta, ni consulta, ni credenciales, y siempre https.
    if (url.protocol === "https:" && url.origin === raw.replace(/\/$/, "")) return url.origin;
  } catch {
    // Cae al registro de abajo.
  }
  logEvent("error", "portal.origen_invalido", { variable: PORTAL_ORIGIN_VARIABLE });
  return null;
}

/**
 * El host público de la petición, sin puerto. Traefik conserva `Host` y pone
 * `X-Forwarded-Host`; dentro del contenedor la URL de la petición es la
 * interna (`0.0.0.0:3000`, el defecto de `306d286`), así que no sirve.
 *
 * Solo decide qué rutas se sirven en cada dominio, nunca un enlace ni un
 * permiso: falsearla no da acceso a nada, porque cada cookie viaja solo al
 * dominio que la puso.
 */
export function requestHost(headers: Headers): string | null {
  const value = headers.get("x-forwarded-host") ?? headers.get("host");
  const first = value?.split(",")[0]?.trim().toLowerCase();
  return first ? first.replace(/:\d+$/, "") : null;
}

export type PortalHostDecision =
  | { kind: "PASS" }
  | { kind: "NOT_FOUND" }
  | { kind: "REDIRECT"; location: string };

/**
 * Qué hace el perímetro con una petición según su dominio, antes de mirar
 * credenciales. Sin portal propio, nada cambia.
 *
 * - **En el dominio del portal** solo existe el portal (y las imágenes de
 *   marca de su pantalla de ingreso). Una ruta de empleados responde 404: la
 *   bandeja no se sirve bajo el origen de los clientes.
 * - **En el de Conecta**, una navegación al portal se manda a su dominio, con
 *   la misma ruta: un enlace de invitación enviado antes del cambio sigue
 *   funcionando. Solo GET y HEAD; un envío de formulario en curso termina
 *   donde empezó.
 */
export function portalHostDecision(params: {
  host: string | null;
  pathname: string;
  search: string;
  method: string;
  portalOrigin: string | null;
}): PortalHostDecision {
  const { host, pathname, search, method, portalOrigin } = params;
  if (portalOrigin === null) return { kind: "PASS" };

  const portalHost = new URL(portalOrigin).hostname;
  if (host === portalHost) {
    return isPortalPath(pathname) || isPublicAssetPath(pathname) ? { kind: "PASS" } : { kind: "NOT_FOUND" };
  }
  if (isPortalPath(pathname) && (method === "GET" || method === "HEAD")) {
    return { kind: "REDIRECT", location: `${portalOrigin}${APP_BASE_PATH}${pathname}${search}` };
  }
  return { kind: "PASS" };
}

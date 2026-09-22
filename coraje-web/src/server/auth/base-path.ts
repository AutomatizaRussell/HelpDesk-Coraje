/**
 * HelpDesk cuelga de `/helpdesk` bajo el dominio de Conecta (D7,
 * contexto-canonico.md §1.1) — debe coincidir exactamente con `basePath` en
 * next.config.ts. `redirect()` de `next/navigation` y `<Link>` ya anteponen
 * este prefijo solos; esta constante existe para los dos casos que no lo
 * hacen automáticamente: las redirecciones construidas a mano en route
 * handlers y el `path` de las cookies, que si se dejara en "/" viajaría a
 * cualquier ruta de Conecta, no solo a las de HelpDesk.
 */
export const APP_BASE_PATH = "/helpdesk";

/**
 * Construye una ruta **relativa al origen** bajo el basePath de la app, a
 * partir de un pathname relativo a la raíz de HelpDesk (ej. "/login",
 * "/tickets/123"), con sus parámetros de consulta opcionales.
 *
 * Devuelve una ruta y no una URL absoluta, y esa es toda la razón de ser de
 * esta función. La versión anterior recibía `request.url` como base y
 * construía una URL completa: detrás del proxy de Coolify eso produce el
 * host **interno** del contenedor, porque `request.url` se arma con el Host
 * que recibe el servidor de Next, no con el que escribió la persona en el
 * navegador. El resultado era un `Location: https://0.0.0.0:3000/helpdesk/`
 * que el navegador no puede resolver (`ERR_ADDRESS_INVALID`).
 *
 * La alternativa obvia —reconstruir el origen leyendo `x-forwarded-proto` y
 * `x-forwarded-host`— se descarta por dos motivos: depende de que el proxy
 * ponga esos encabezados, y obliga a validarlos contra una lista blanca,
 * porque un Host inyectado por el cliente convertiría cada redirección en un
 * *open redirect*. Un `Location` relativo no tiene ninguno de los dos
 * problemas: el navegador lo resuelve contra el origen que él mismo pidió.
 * RFC 7231 §7.1.2 lo permite explícitamente desde 2014.
 */
export function buildAppPath(
  pathname: string,
  searchParams?: Record<string, string>,
): string {
  const path = `${APP_BASE_PATH}${pathname}`;
  if (!searchParams) return path;
  const query = new URLSearchParams(searchParams).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * HelpDesk cuelga de `/app/HelpDesk` bajo el dominio de Conecta (D7,
 * contexto-canonico.md §1.1) — debe coincidir exactamente con `basePath` en
 * next.config.ts. `redirect()` de `next/navigation` y `<Link>` ya anteponen
 * este prefijo solos; esta constante existe para los dos casos que no lo
 * hacen automáticamente: URLs construidas a mano en route handlers
 * (`NextResponse.redirect(new URL(...))`) y el `path` de las cookies, que si
 * se dejara en "/" viajaría a cualquier ruta de Conecta, no solo a las de
 * HelpDesk.
 */
export const APP_BASE_PATH = "/app/HelpDesk";

/**
 * Construye una URL absoluta bajo el basePath de la app, a partir de un
 * pathname relativo a la raíz de HelpDesk (ej. "/login", "/tickets/123").
 * `base` es normalmente `request.url`.
 */
export function buildAppUrl(pathname: string, base: string | URL): URL {
  return new URL(`${APP_BASE_PATH}${pathname}`, base);
}

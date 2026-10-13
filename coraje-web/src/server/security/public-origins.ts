import { APP_BASE_PATH } from "@/server/auth/base-path";
import { logEvent } from "@/server/observability/log";

/**
 * Los dos orígenes públicos por los que se entra a HelpDesk (U20, decisión del
 * usuario del 13-oct-2026).
 *
 * - **Conecta** (`https://conecta.rbgct.cloud/helpdesk`), el de siempre: la
 *   entrada sin clics lee el perfil de Conecta del `localStorage`, que solo
 *   existe en su origen (contexto-canonico.md §1.1). Es el único que llevan
 *   los correos.
 * - **Directo** (`https://helpdesk.rbgct.cloud/helpdesk`), el salvavidas: sirve
 *   para entrar aunque el dominio o el enrutamiento de Conecta fallen. Allí no
 *   hay perfil de Conecta, así que la persona elige cuenta en `/login` y ve la
 *   barra propia de HelpDesk (specs/integracion-conecta.md §2). Las cookies son
 *   de cada dominio: es una sesión aparte.
 *
 * Sustituye al dominio de clientes de U18 (`soporte.rbgct.cloud`), que nunca
 * llegó a tener DNS y se retiró con la desconexión del portal.
 *
 * El directo llega por `HELPDESK_DIRECT_ORIGIN` y no de las cabeceras: una
 * cabecera solo **elige** entre estos dos orígenes, nunca aporta uno. Sin la
 * variable, todo funciona como antes, solo por Conecta; así esto se despliega
 * antes de que existan el DNS, el dominio en Coolify y la dirección de
 * retorno en Entra, y se enciende creando la variable al final.
 */

/** Origen de Conecta, del que cuelga HelpDesk bajo `/helpdesk` (D7). */
export const CONECTA_ORIGIN = "https://conecta.rbgct.cloud";

const DIRECT_ORIGIN_VARIABLE = "HELPDESK_DIRECT_ORIGIN";

/**
 * El origen directo (`https://helpdesk.rbgct.cloud`), o `null` si no está
 * configurado. Un valor mal escrito se ignora con un registro, en vez de
 * tumbar el perímetro: sin entrada directa, la aplicación sigue funcionando
 * por Conecta, y el error queda a la vista en el registro.
 */
export function directPublicOrigin(): string | null {
  const raw = process.env[DIRECT_ORIGIN_VARIABLE]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Solo el origen: ni ruta, ni consulta, ni credenciales, y siempre https.
    if (url.protocol === "https:" && url.origin === raw.replace(/\/$/, "")) return url.origin;
  } catch {
    // Cae al registro de abajo.
  }
  logEvent("error", "origen.directo_invalido", { variable: DIRECT_ORIGIN_VARIABLE });
  return null;
}

/**
 * El host público de la petición, sin puerto. Traefik conserva `Host` y pone
 * `X-Forwarded-Host`; dentro del contenedor la URL de la petición es la
 * interna (`0.0.0.0:3000`, el defecto de `306d286`), así que no sirve.
 */
export function requestHost(headers: Headers): string | null {
  const value = headers.get("x-forwarded-host") ?? headers.get("host");
  const first = value?.split(",")[0]?.trim().toLowerCase();
  return first ? first.replace(/:\d+$/, "") : null;
}

/**
 * ¿Llegó la petición por el dominio directo? Falsear la cabecera no da nada:
 * solo cambia a cuál de los dos orígenes conocidos vuelve la persona, y cada
 * cookie viaja solo al dominio que la puso.
 */
export function isDirectEntry(headers: Headers): boolean {
  const direct = directPublicOrigin();
  return direct !== null && requestHost(headers) === new URL(direct).hostname;
}

/**
 * La dirección de retorno de Entra para una entrada por el dominio directo, o
 * `null` para la de Conecta, que sigue saliendo de `ENTRA_REDIRECT_URI`.
 *
 * Entra exige que la dirección del `/authorize` y la del canje del código
 * sean la misma, y que esté registrada en la App Registration: cada dominio
 * necesita la suya, porque la cookie de estado solo existe en el dominio donde
 * empezó el ingreso.
 */
export function directRedirectUri(headers: Headers): string | null {
  if (!isDirectEntry(headers)) return null;
  return `${directPublicOrigin()}${APP_BASE_PATH}/api/auth/microsoft/callback`;
}

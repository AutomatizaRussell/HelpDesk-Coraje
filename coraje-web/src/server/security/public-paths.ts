import { APP_BASE_PATH } from "@/server/auth/base-path";

/**
 * Clasificación de rutas del perímetro: qué es público y qué no.
 *
 * Vive en su propio módulo, separado de `src/proxy.ts`, por una razón
 * concreta: la prueba que enumera `src/app` y exige que toda ruta privada
 * esté cubierta necesita esta clasificación, y no puede importar el proxy
 * sin arrastrar el entorno de ejecución de Next. La regla que el perímetro
 * aplica y la regla que la prueba verifica tienen que ser **el mismo
 * código**, o la prueba estaría comprobando una copia que puede divergir.
 */

/**
 * Todo lo alcanzable sin sesión de empleado, de forma exhaustiva
 * (specs/acceso-empleados.md §8).
 *
 * Añadir una entrada aquí es el **único** acto que vuelve algo público, y es
 * visible en la revisión del cambio. Esa es justamente la propiedad que el
 * modelo anterior —cada página con su propio guard— no tenía: allí lo público
 * era el resultado de un olvido, no de una decisión.
 *
 * - `/login`: la puerta. Se dibuja sin sesión por definición.
 * - `/ingreso`: la detección de la entrada (specs/integracion-conecta.md §2).
 *   Decide en el navegador si hay sesión de Conecta; no muestra datos.
 * - `/api/auth/microsoft`: el inicio del flujo OIDC y la vuelta del proveedor.
 *   Quien las pide todavía no tiene sesión; es lo que van a producir.
 *
 * - `/portal/ingreso`: el cliente escribe su correo y el código que recibe.
 *   Produce la identidad del portal; no muestra datos, y su respuesta es la
 *   misma exista o no el correo (acceso-clientes.md §9).
 * - `/portal/activar`: el enlace de invitación. El enlace es la credencial, y
 *   abrirlo no consume nada: activar es una acción explícita.
 *
 * Lo que **no** está: el resto del portal. `/portal` y todo lo que cuelga de
 * él es una tercera clase de ruta —ni anónima ni de empleado— que exige la
 * cookie del navegador recordado (`isPortalPath`). El portal abierto de antes
 * de U4, que listaba clientes sin credencial, no vuelve por aquí.
 */
export const PUBLIC_PATHS = ["/login", "/ingreso", "/api/auth/microsoft", "/portal/ingreso", "/portal/activar"] as const;

/** Prefijo del portal de clientes (specs/acceso-clientes.md). */
export const PORTAL_PREFIX = "/portal";

/**
 * Prefijo, no coincidencia exacta: `/api/auth/microsoft` cubre `/start` y
 * `/callback` sin enumerarlos. El `/` del final es obligatorio — sin él,
 * `/loginfalso` pasaría por público al empezar por `/login`.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** ¿Ruta del portal de clientes? Misma regla de prefijo con barra. */
export function isPortalPath(pathname: string): boolean {
  return pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`);
}

/**
 * Las tres clases de ruta del perímetro, en el orden en que se deciden:
 * - `PUBLICA`: pasa sin credencial (la lista de arriba, y nada más);
 * - `PORTAL`: exige la cookie del navegador recordado de un cliente;
 * - `EMPLEADO`: todo lo demás, exige la cookie de sesión de empleado.
 *
 * Una credencial no abre la clase de la otra: la sesión de un empleado no
 * entra al portal y la de un cliente no entra a la bandeja. Tampoco podría
 * aunque se quisiera: cada cookie viaja solo a su ruta (`path`).
 */
export type PathAccess = "PUBLICA" | "PORTAL" | "EMPLEADO";

export function classifyPath(pathname: string): PathAccess {
  if (isPublicPath(pathname)) return "PUBLICA";
  if (isPortalPath(pathname)) return "PORTAL";
  return "EMPLEADO";
}

/**
 * Devuelve el pathname **relativo a la raíz de HelpDesk**, con el prefijo de
 * despliegue quitado si venía puesto.
 *
 * Existe porque el perímetro no puede permitirse una duda sobre su entrada.
 * Next documenta que en el proxy el `basePath` ya viene descontado de
 * `nextUrl.pathname`, pero de eso depende aquí la diferencia entre denegar
 * por defecto y dejar pasar todo: si el prefijo llegara puesto, ninguna ruta
 * coincidiría con la lista pública **y tampoco con nada privado en la
 * prueba**, y el fallo sería silencioso en el sentido peor —el perímetro
 * seguiría respondiendo, solo que clasificando mal—. Normalizar de las dos
 * formas cuesta tres líneas y hace que el resultado sea el mismo bajo
 * cualquiera de los dos comportamientos.
 *
 * No hay ambigüedad posible con una ruta propia: HelpDesk no tiene ninguna
 * página `/helpdesk` dentro de sí mismo.
 */
export function normalizeAppPathname(pathname: string): string {
  if (pathname === APP_BASE_PATH) return "/";
  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length);
  }
  return pathname;
}

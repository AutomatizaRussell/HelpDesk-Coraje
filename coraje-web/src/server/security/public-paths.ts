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
 * Lo que **no** está y antes sí habría estado: el portal de clientes y su
 * API. No se declararon públicos, se retiraron (U4). El acceso externo con
 * identidad propia es `specs/acceso-clientes.md`, y hasta que exista no hay
 * ninguna superficie anónima que listara clientes ni escribiera tickets.
 */
export const PUBLIC_PATHS = ["/login", "/ingreso", "/api/auth/microsoft"] as const;

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

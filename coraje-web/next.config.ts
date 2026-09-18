import type { NextConfig } from "next";

/**
 * HelpDesk cuelga de una subruta de Conecta (`/helpdesk`), no de su propio
 * dominio — decisión de D7 (contexto-canonico.md §1.1): el shell visual y la
 * URL deben leerse como parte de Conecta. `basePath` hace que Next.js anteponga
 * ese prefijo a todas sus rutas internas (páginas, API routes, assets), para
 * que ningún enlace o redirect generado por el código tenga que saber del
 * prefijo a mano.
 *
 * El prefijo es de primer nivel y en minúsculas, y las dos cosas son
 * deliberadas:
 *
 * - **Primer nivel, fuera de `/app`.** `/app` es el espacio de rutas del portal
 *   de empleados de Conecta, con sus propias rutas hijas y su propio guardia de
 *   sesión. Colgar de ahí una aplicación con identidad distinta acopla HelpDesk
 *   a un prefijo que otro equipo edita, y no compra ninguna integración: bajo
 *   enrutamiento transparente el prefijo no aporta nada visual, el shell lo
 *   aporta la interfaz.
 * - **Minúsculas.** La regla de enrutamiento del proxy distingue mayúsculas. Un
 *   prefijo con mayúsculas hace que una URL escrita a mano con otra caja no
 *   llegue nunca a HelpDesk y caiga en el SPA de Conecta, que no reconoce la
 *   ruta y redirige a su raíz: un fallo silencioso, sin error visible.
 *
 * El proxy debe reenviar `/helpdesk/*` tal cual (sin quitar el prefijo) al
 * contenedor de HelpDesk — si lo quita, Next.js deja de reconocer sus propias
 * rutas y responde 404 en todas.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/helpdesk",
};

export default nextConfig;

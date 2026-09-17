import type { NextConfig } from "next";

/**
 * HelpDesk cuelga de una subruta de Conecta (`/app/HelpDesk`), no de su propio
 * dominio — decisión de D7 (contexto-canonico.md §1.1): el shell visual y la
 * URL deben leerse como parte de Conecta. `basePath` hace que Next.js anteponga
 * ese prefijo a todas sus rutas internas (páginas, API routes, assets), para
 * que ningún enlace o redirect generado por el código tenga que saber del
 * prefijo a mano. El proxy de Conecta debe reenviar `/app/HelpDesk/*` tal cual
 * (sin quitar el prefijo) al contenedor de HelpDesk — si lo quita, Next.js deja
 * de reconocer sus propias rutas.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/app/HelpDesk",
};

export default nextConfig;

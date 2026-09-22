/**
 * Archivos estáticos que el perímetro deja pasar sin sesión, uno por uno.
 *
 * La lista es **exacta y no por extensión ni por carpeta**: un comodín del
 * tipo "todo lo que termine en .png" convierte en público cualquier archivo
 * que alguien deje caer en `public/` mañana, sin que nadie lo decida. Aquí
 * hacerlo público es un acto visible en una revisión de código.
 *
 * Hay dos motivos para que exista esta excepción, y ninguno es cosmético:
 *
 * - La pantalla de acceso y las de error se dibujan **sin sesión**, así que
 *   cualquier imagen que usen tiene que ser alcanzable sin ella.
 * - El optimizador de imágenes de Next (`next/image`) descarga el archivo
 *   original con una petición **interna del servidor a sí mismo**, que no
 *   lleva las cookies del navegador. Si el perímetro la bloqueara, la imagen
 *   no se rompería de forma evidente: el optimizador recibiría el HTML de una
 *   redirección y fallaría al procesarlo.
 */
export const PUBLIC_ASSET_PATHS = new Set(["/rb-logo.png"]);

export function isPublicAssetPath(pathname: string): boolean {
  return PUBLIC_ASSET_PATHS.has(pathname);
}

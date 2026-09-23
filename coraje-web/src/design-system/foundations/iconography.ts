/**
 * Iconografía: lucide-react, la misma librería del shell de Conecta, para que
 * el sidebar replicado use los mismos pictogramas.
 *
 * El tamaño del icono **no** se pasa por la prop `size` de lucide —sería un
 * número en píxeles escrito en la vista—: se fija con una clase de la escala
 * de espaciado (`size-4.5`). El trazo sí es un atributo SVG sin equivalente en
 * Tailwind, y por eso vive aquí como única autoridad.
 */
export const iconStroke = {
  regular: 2,
  light: 1.75,
} as const;

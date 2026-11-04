import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { helpdeskTheme } from "./themes/helpdesk";

/**
 * Tamaño de los logotipos servidos (U27).
 *
 * Sin optimizador de imágenes (`next.config.ts`), el archivo de `public/` es
 * exactamente lo que descarga el navegador. Tiene que bastar para pantallas de
 * densidad doble en la ubicación más ancha, y no traer más: el original del
 * paquete de marca mide 2422 px y vive en `docs/design/marca/`, fuera de la
 * imagen. La prueba falla si alguien vuelve a poner el original en `public/`
 * o si un token de ancho crece por encima de lo que el archivo cubre.
 */

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

/** Ancho de un PNG, leído de la cabecera IHDR (bytes 16-19, big-endian). */
function pngWidth(file: string): number {
  return readFileSync(path.join(PUBLIC_DIR, file)).readUInt32BE(16);
}

const size = helpdeskTheme.size as Record<string, string>;
const px = (token: string) => Number.parseFloat(size[token]);
const widest = (prefix: string) =>
  Math.max(...Object.keys(size).filter((key) => key.startsWith(prefix)).map(px));

const assets = [
  { file: "rb-logo.png", display: widest("logo") },
  { file: "rb-logo-white.png", display: widest("logo") },
  // El isotipo pequeño sirve a la columna de Conecta y al estado vacío (U30).
  { file: "rb-isotype-white.png", display: Math.max(px("isotype"), px("emptyIsotype")) },
  // El de la cabecera del área (U30) es otro archivo: a 256 px, el de 108 px
  // se vería borroso, y servir uno de 512 px en la columna sería desperdicio.
  { file: "rb-isotype-white-hero.png", display: px("heroGlobe") },
];

for (const { file, display } of assets) {
  test(`${file} cubre 2x su mayor ancho en pantalla sin pasar de 3x`, () => {
    const width = pngWidth(file);
    assert.ok(width >= display * 2, `${file}: ${width} px < 2 × ${display} px`);
    assert.ok(width <= display * 3, `${file}: ${width} px > 3 × ${display} px`);
  });
}

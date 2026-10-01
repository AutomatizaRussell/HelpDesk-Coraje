import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AREA_THEME_KEYS } from "./patterns/area/area";
import { helpdeskTheme } from "./themes/helpdesk";

/**
 * Paleta del modo Coraje (U17): que cada clave redefina una variable que
 * existe, que `globals.css` las redefina todas y solo esas, y que lo que se
 * lee en ese modo se lea. Mismo papel que `area-palette.test.mts` para el
 * color por área.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(THIS_DIR, "../app/globals.css"), "utf8").replace(/\r\n/g, "\n");

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** `{ color: { canvas: … } }` → `[["color", "canvas"], …]`. */
function leafPaths(node: object, prefix: string[] = []): string[][] {
  return Object.entries(node).flatMap(([key, value]) =>
    value !== null && typeof value === "object" ? leafPaths(value, [...prefix, key]) : [[...prefix, key]],
  );
}

function at(node: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], node);
}

const corajePaths = leafPaths(helpdeskTheme.coraje);
const variable = (keys: readonly string[]) => keys.map(kebab).join("-");

/** El valor que una variable toma en modo Coraje: el redefinido, o el de siempre. */
function inCoraje(...keys: string[]): string {
  const value = at(helpdeskTheme.coraje, keys) ?? at(helpdeskTheme, keys);
  assert.equal(typeof value, "string", keys.join("."));
  return value as string;
}

/** Luminancia relativa de WCAG 2.x. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function assertContrast(ink: string, background: string, minimum: number, label: string) {
  const [light, dark] = [luminance(ink), luminance(background)].sort((x, y) => y - x);
  const ratio = (light + 0.05) / (dark + 0.05);
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1, mínimo ${minimum}:1`);
}

test("cada clave del modo redefine una variable que existe en el tema base", () => {
  for (const keys of corajePaths) assert.equal(typeof at(helpdeskTheme, keys), "string", `coraje.${keys.join(".")} no existe fuera del modo`);
});

test("globals.css redefine en [data-mode=\"coraje\"] exactamente las claves del modo", () => {
  const block = css.match(/\[data-mode="coraje"\],\s*:root:has\(\[data-mode="coraje"\]\)\s*\{([^}]*)\}/)?.[1];
  assert.ok(block, 'Falta el bloque [data-mode="coraje"] en globals.css');
  const declared = [...block.matchAll(/(--hd-[a-z0-9-]+):\s*var\((--hd-[a-z0-9-]+)\);/g)].map(([, name, source]) => `${name} ← ${source}`);
  const expected = corajePaths.map((keys) => `--hd-${variable(keys)} ← --hd-coraje-${variable(keys)}`);
  assert.deepEqual(declared.sort(), expected.sort());
});

test("el texto se lee sobre el lienzo y las superficies (≥ 4,5:1)", () => {
  for (const ink of ["ink", "inkMuted", "heading"]) {
    for (const background of ["canvas", "surface", "surfaceSunken"]) {
      assertContrast(inCoraje("color", ink), inCoraje("color", background), 4.5, `${ink} sobre ${background}`);
    }
  }
});

test("los estados se leen sobre su fondo y sobre la superficie (≥ 4,5:1)", () => {
  for (const tone of ["danger", "warning", "success"]) {
    assertContrast(inCoraje("color", tone), inCoraje("color", `${tone}Surface`), 4.5, `${tone} sobre su fondo`);
    assertContrast(inCoraje("color", tone), inCoraje("color", "surface"), 4.5, `${tone} sobre surface`);
  }
  assertContrast(inCoraje("color", "heading"), inCoraje("color", "infoSurface"), 4.5, "heading sobre infoSurface");
});

test("cada área se ve sobre navy y su tinta se lee sobre ella", () => {
  for (const area of AREA_THEME_KEYS) {
    const mark = inCoraje("area", area, "mark");
    // El punto y el avatar sobre el lienzo: componente no textual, 3:1.
    assertContrast(mark, inCoraje("color", "canvas"), 3, `${area}: marca sobre el lienzo`);
    assertContrast(mark, inCoraje("area", area, "onMark"), 4.5, `${area}: inicial sobre la marca`);
    assertContrast(inCoraje("color", "heading"), inCoraje("area", area, "surface"), 4.5, `${area}: texto sobre la selección`);
  }
});

test("acción, foco, topbar y menú se leen en el modo", () => {
  assertContrast(inCoraje("color", "onAction"), inCoraje("color", "action"), 4.5, "botón principal");
  assertContrast(inCoraje("color", "onAction"), inCoraje("color", "actionHover"), 4.5, "botón principal al pasar el ratón");
  for (const background of ["canvas", "surface"]) {
    assertContrast(inCoraje("color", "focus"), inCoraje("color", background), 3, `foco sobre ${background}`);
  }
  assertContrast(inCoraje("shell", "topbarMuted"), inCoraje("shell", "topbarSurface"), 4.5, "iconos de la topbar");
  assertContrast(inCoraje("shell", "topbarMuted"), inCoraje("shell", "controlHoverSurface"), 4.5, "icono con el ratón encima");
  assertContrast(inCoraje("shell", "menuDangerInk"), inCoraje("color", "surface"), 4.5, "cerrar sesión en el menú");
  assertContrast(inCoraje("shell", "menuDangerHoverInk"), inCoraje("shell", "menuDangerHoverSurface"), 4.5, "cerrar sesión con el ratón encima");
});

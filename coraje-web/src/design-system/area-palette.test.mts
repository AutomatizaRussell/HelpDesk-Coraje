import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AREA_THEME_KEYS } from "./patterns/area/area";
import { helpdeskTheme } from "./themes/helpdesk";

/**
 * Paleta por área (U16): contrastes medidos y coherencia entre el tema y las
 * reglas `[data-area]` de `globals.css`. El validador general del contrato
 * cubre `:root`; esto cubre lo que vive fuera de él.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(THIS_DIR, "../app/globals.css"), "utf8").replace(/\r\n/g, "\n");

/** Luminancia relativa de WCAG 2.x. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const areas = Object.entries(helpdeskTheme.area);

test("las claves del patrón son las del tema", () => {
  assert.deepEqual([...AREA_THEME_KEYS].sort(), Object.keys(helpdeskTheme.area).sort());
});

test("la tinta sobre el color pleno se lee (≥ 4,5:1): inicial del avatar y número de la campana", () => {
  for (const [key, { mark, onMark }] of areas) {
    const ratio = contrast(mark, onMark);
    assert.ok(ratio >= 4.5, `${key}: ${ratio.toFixed(2)}:1`);
  }
});

test("el texto navy se lee sobre la tinta del área (≥ 4,5:1): pestaña y selección activas", () => {
  for (const [key, { surface }] of areas) {
    const ratio = contrast(surface, helpdeskTheme.color.heading);
    assert.ok(ratio >= 4.5, `${key}: ${ratio.toFixed(2)}:1`);
  }
});

test("el área general es el acento de siempre: sin área, nada cambia", () => {
  assert.equal(helpdeskTheme.area.general.mark, helpdeskTheme.color.accent);
  assert.equal(helpdeskTheme.area.general.surface, helpdeskTheme.color.accentSurface);
  assert.equal(helpdeskTheme.area.general.onMark, helpdeskTheme.color.onAccent);
});

test("cada área redefine en globals.css exactamente su acento", () => {
  for (const key of AREA_THEME_KEYS) {
    const block = css.match(new RegExp(`\\[data-area="${key}"\\]\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(block, `Falta [data-area="${key}"] en globals.css`);
    assert.match(block, new RegExp(`--hd-color-accent:\\s*var\\(--hd-area-${key}-mark\\);`));
    assert.match(block, new RegExp(`--hd-color-accent-surface:\\s*var\\(--hd-area-${key}-surface\\);`));
    assert.match(block, new RegExp(`--hd-color-on-accent:\\s*var\\(--hd-area-${key}-on-mark\\);`));
    assert.doesNotMatch(block, /--hd-color-(?!accent|on-accent)/, `${key} redefine algo que no es el acento`);
  }
});

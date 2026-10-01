import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AREA_THEME_KEYS } from "./patterns/area/area";
import { helpdeskTheme } from "./themes/helpdesk";

/**
 * Paleta del modo Coraje (U17): que cada clave redefina una variable que
 * existe, que `globals.css` las redefina todas y solo esas en su selector, y
 * que lo que se lee en ese modo se lea. Mismo papel que
 * `area-palette.test.mts` para el color por área.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(THIS_DIR, "../app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const { coraje } = helpdeskTheme;

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const escape = (text: string) => text.replace(/[[\]().*+?^$|{}\\]/g, "\\$&");

/** Las redefiniciones `--destino ← --origen` de un bloque CSS, ordenadas. */
function redefinitions(selector: string): string[] {
  const block = css.match(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `Falta el bloque ${selector} en globals.css`);
  return [...block.matchAll(/(--hd-[a-z0-9-]+):\s*var\((--hd-[a-z0-9-]+)\);/g)].map(([, name, source]) => `${name} ← ${source}`).sort();
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

/** El acento de un área en modo Coraje: el redefinido, o la marca de siempre. */
function corajeAccent(area: (typeof AREA_THEME_KEYS)[number]) {
  const override = (coraje.accent as Partial<Record<string, { accent: string; onAccent: string }>>)[area];
  return override ?? { accent: helpdeskTheme.area[area].mark, onAccent: helpdeskTheme.area[area].onMark };
}

test("cada clave del modo redefine una variable que existe en el tema base", () => {
  for (const key of Object.keys(coraje.color)) assert.ok(key in helpdeskTheme.color, `color.${key}`);
  for (const key of Object.keys(coraje.shell)) assert.ok(key in helpdeskTheme.shell, `shell.${key}`);
  for (const key of Object.keys(coraje.band)) assert.ok(key in helpdeskTheme.color, `band.${key} no es un color`);
  for (const area of Object.keys(coraje.accent)) assert.ok((AREA_THEME_KEYS as readonly string[]).includes(area), area);
});

test("globals.css redefine en cada bloque exactamente las claves del modo", () => {
  const sameName = (group: "color" | "shell") =>
    Object.keys(coraje[group]).map((key) => `--hd-${group}-${kebab(key)} ← --hd-coraje-${group}-${kebab(key)}`);
  assert.deepEqual(redefinitions('[data-mode="coraje"],\n:root:has([data-mode="coraje"])'), [...sameName("color"), ...sameName("shell")].sort());

  const band = Object.keys(coraje.band).map((key) => `--hd-color-${kebab(key)} ← --hd-coraje-band-${kebab(key)}`);
  assert.deepEqual(redefinitions('[data-mode="coraje"] [data-shell-band]'), band.sort());

  for (const [area, keys] of Object.entries(coraje.accent)) {
    const expected = Object.keys(keys).map((key) => `--hd-color-${kebab(key)} ← --hd-coraje-accent-${area}-${kebab(key)}`);
    assert.deepEqual(redefinitions(`[data-mode="coraje"][data-area="${area}"]`), expected.sort());
  }
});

test("el contenido se lee sobre el lienzo teñido (≥ 4,5:1)", () => {
  for (const ink of ["ink", "inkMuted", "heading", "danger", "warning", "success"] as const) {
    assertContrast(helpdeskTheme.color[ink], coraje.color.canvas, 4.5, `${ink} sobre el lienzo`);
  }
});

test("la topbar navy se lee y su foco se ve", () => {
  const { topbarSurface, topbarInk, topbarMuted, topbarFocus, controlHoverSurface } = coraje.shell;
  for (const background of [topbarSurface, controlHoverSurface]) {
    assertContrast(topbarInk, background, 4.5, "título de la topbar");
    assertContrast(topbarMuted, background, 4.5, "iconos de la topbar");
  }
  assertContrast(topbarFocus, topbarSurface, 3, "foco en la topbar");
});

test("la fila de pestañas navy se lee y su foco se ve", () => {
  const { surface, surfaceSunken, heading, inkMuted, accentSurface, focus } = coraje.band;
  for (const background of [surface, surfaceSunken, accentSurface]) {
    assertContrast(heading, background, 4.5, "pestaña activa");
    assertContrast(inkMuted, background, 4.5, "pestaña inactiva");
  }
  assertContrast(focus, surface, 3, "foco en las pestañas");
});

test("el acento de cada área se ve sobre el marco navy y su tinta se lee sobre él", () => {
  for (const area of AREA_THEME_KEYS) {
    const { accent, onAccent } = corajeAccent(area);
    // Subrayado de la pestaña, avatar y número: componente no textual, 3:1.
    assertContrast(accent, coraje.shell.topbarSurface, 3, `${area}: acento sobre la topbar`);
    assertContrast(accent, coraje.band.surface, 3, `${area}: acento sobre las pestañas`);
    assertContrast(onAccent, accent, 4.5, `${area}: inicial sobre el acento`);
  }
});

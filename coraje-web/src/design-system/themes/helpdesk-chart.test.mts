import { test } from "node:test";
import assert from "node:assert/strict";

import { AREA_THEME_KEYS } from "../patterns/area/area";
import { helpdeskTheme } from "./helpdesk";
import { helpdeskChart } from "./helpdesk-chart";

/**
 * Contrato del tema de gráficos (design/sistema-helpdesk.md §5.9). Lo que
 * fija: que un área se pinta en un gráfico con el mismo color que en la
 * bandeja, y que la rampa de la escala de oportunidad aclara de un paso al
 * siguiente. La separación entre colores se midió con el validador de
 * paletas al decidir la rampa; aquí solo se protege su orden.
 */

/** Luminancia relativa WCAG de un hexadecimal. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("cada área se pinta en el gráfico con el mismo color que en la bandeja", () => {
  for (const key of AREA_THEME_KEYS) {
    assert.equal(helpdeskChart.color.area[key], helpdeskTheme.area[key].mark, key);
  }
});

test("la rampa de la escala va de oscuro a claro, sin pasos repetidos", () => {
  const steps = helpdeskChart.color.escala.map(luminance);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1], `paso ${i} no es más claro que el ${i - 1}`);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { conectaNavigation, type ConectaNavEntry } from "./conecta-navigation";
import type { ConectaModule } from "./conecta-modules";

/**
 * Visibilidad del menú de Conecta replicado (conecta-navigation.ts): cada
 * entrada condicionada aparece con el mismo módulo que en `sidebarConfig.js`
 * de Conecta, y ninguna otra.
 */

const labels = (modules: ConectaModule[]) =>
  conectaNavigation(modules).flatMap((section) =>
    section.items.flatMap((entry: ConectaNavEntry) =>
      entry.kind === "group" ? [entry.label, ...entry.children.map((child) => `${entry.label} › ${child.label}`)] : [entry.label],
    ),
  );

test("sin módulos se ve el menú de cualquier empleado", () => {
  assert.deepEqual(labels([]), ["Mi resumen", "Auto gestión", "Mi perfil", "Reglamento", "Herramientas", "SQF"]);
});

test("«Mis clientes» aparece con cualquiera de sus hijos, y solo con los que tocan", () => {
  assert.deepEqual(
    labels(["seguimiento_facturacion"]).filter((label) => label.startsWith("Mis clientes")),
    ["Mis clientes", "Mis clientes › Seguimiento Facturación"],
  );
  assert.deepEqual(
    labels(["sqf", "seguimiento_facturacion", "tesoreria_ver"]).filter((label) => label.startsWith("Mis clientes")),
    [
      "Mis clientes",
      "Mis clientes › Formularios SQF",
      "Mis clientes › Seguimiento Facturación",
      "Mis clientes › Tesorería BPO",
    ],
  );
});

test("Tesorería Administración y AuditHub dependen de su propio módulo", () => {
  assert.ok(!labels(["tesoreria_ver"]).includes("Tesorería Administración"));
  assert.ok(labels(["tesoreria_admin_ver"]).includes("Tesorería Administración"));
  assert.ok(!labels(["sqf"]).includes("AuditHub"));
  assert.ok(labels(["audithub"]).includes("AuditHub"));
});

test("el único ítem activo es «Auto gestión»", () => {
  const current = conectaNavigation(["sqf", "tesoreria_admin_ver", "audithub"])
    .flatMap((section) => section.items)
    .flatMap((entry) => (entry.kind === "group" ? entry.children : [entry]))
    .filter((link) => link.current)
    .map((link) => link.label);
  assert.deepEqual(current, ["Auto gestión"]);
});

test("los accesos rápidos abren pestaña nueva con el símbolo de su aplicación", () => {
  const accesos = conectaNavigation(["audithub"]).find((section) => section.label === "Accesos rápidos");
  for (const entry of accesos?.items ?? []) {
    assert.equal(entry.kind, "link");
    if (entry.kind !== "link") continue;
    assert.equal(entry.external, true, entry.label);
    assert.ok(entry.symbol, entry.label);
  }
});

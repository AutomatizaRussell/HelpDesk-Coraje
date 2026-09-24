import { test } from "node:test";
import assert from "node:assert/strict";

import { bindProfileToIdentity, parseConectaProfile, parseEntryContext } from "./entry-context";

/**
 * Contexto de entrada desde Conecta (entry-context.ts;
 * specs/integracion-conecta.md §4). Es un dato que controla el navegador, así
 * que lo que se prueba son las cuatro reglas que lo acotan: solo mostrar, solo
 * de la misma persona, mínimo y con fallo cerrado.
 */

const conecta = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    correo_corporativo: "DanielLopera@rbcol.co",
    primer_nombre: "DANIEL",
    primer_apellido: "LOPERA",
    nombre_area: "ADMINISTRACIÓN",
    nombre_cargo: "ANALISTA",
    acceso_sqf_clientes: false,
    acceso_sqf_contratos: false,
    acceso_sqf_facturacion: false,
    acceso_sqf_auditoria: false,
    ...overrides,
  });

test("un perfil válido se reduce a lo que pinta el menú", () => {
  assert.deepEqual(parseConectaProfile(conecta()), {
    email: "daniellopera@rbcol.co",
    shortName: "DANIEL LOPERA",
    subtitle: "ADMINISTRACIÓN",
    sqfAccess: false,
  });
});

test("cualquier permiso SQF hace visible «Mis clientes»", () => {
  for (const flag of ["acceso_sqf_clientes", "acceso_sqf_contratos", "acceso_sqf_facturacion", "acceso_sqf_auditoria"]) {
    assert.equal(parseConectaProfile(conecta({ [flag]: true }))?.sqfAccess, true, flag);
  }
});

test("sin área se usa el cargo, como en Conecta", () => {
  assert.equal(parseConectaProfile(conecta({ nombre_area: "" }))?.subtitle, "ANALISTA");
});

test("fallo cerrado: lo que no es un empleado de Conecta no produce perfil", () => {
  for (const raw of [
    null,
    "",
    "no-es-json",
    "null",
    "[]",
    conecta({ correo_corporativo: "sin-arroba" }),
    conecta({ correo_corporativo: 42 }),
    conecta({ primer_nombre: "x".repeat(101) }),
    conecta({ acceso_sqf_clientes: "true" }),
    "x".repeat(5000),
  ]) {
    assert.equal(parseConectaProfile(raw), null, `Debió rechazarse: ${String(raw).slice(0, 60)}`);
  }
});

test("el perfil solo sobrevive si es de la persona admitida", () => {
  const profile = parseConectaProfile(conecta());
  assert.equal(bindProfileToIdentity(profile, "DANIELLOPERA@rbcol.co")?.shortName, "DANIEL LOPERA");
  assert.equal(bindProfileToIdentity(profile, "otra.persona@rbcol.co"), null);
  assert.equal(bindProfileToIdentity(profile, null), null);
  assert.equal(bindProfileToIdentity(null, "daniellopera@rbcol.co"), null);
});

test("la cookie de entrada ilegible o ajena equivale a entrada directa", () => {
  for (const raw of [null, "", "{", '{"via":"admin"}', '{"via":"conecta"}']) {
    assert.deepEqual(parseEntryContext(raw), { via: "directo" }, String(raw));
  }
  assert.deepEqual(parseEntryContext('{"via":"conecta","profile":null}'), { via: "conecta", profile: null });
});

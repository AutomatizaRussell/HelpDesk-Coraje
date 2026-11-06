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
    permisos: [],
    ...overrides,
  });

test("un perfil válido se reduce a lo que pinta el menú", () => {
  assert.deepEqual(parseConectaProfile(conecta()), {
    email: "daniellopera@rbcol.co",
    shortName: "DANIEL LOPERA",
    modules: [],
  });
});

test("de los permisos de Conecta solo quedan los que usa su menú", () => {
  const profile = parseConectaProfile(
    conecta({ permisos: ["formacion", "audithub", "sqf", "eeff", "tesoreria_ver", "sqf", "colaboradores_ver"] }),
  );
  assert.deepEqual(profile?.modules, ["sqf", "tesoreria_ver", "audithub"]);
});

test("permisos ausentes o con otra forma dejan el perfil con el menú mínimo", () => {
  for (const permisos of [undefined, null, "sqf", [1, 2], ["x".repeat(65)], Array.from({ length: 65 }, () => "sqf")]) {
    const profile = parseConectaProfile(conecta({ permisos }));
    assert.equal(profile?.shortName, "DANIEL LOPERA", JSON.stringify(permisos));
    assert.deepEqual(profile?.modules, [], JSON.stringify(permisos));
  }
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

test("una cookie anterior a los módulos se lee con el menú mínimo, sin perder el modo", () => {
  const legacy = JSON.stringify({
    via: "conecta",
    profile: { email: "daniellopera@rbcol.co", shortName: "DANIEL LOPERA", subtitle: "ADMINISTRACIÓN", sqfAccess: true },
  });
  assert.deepEqual(parseEntryContext(legacy), {
    via: "conecta",
    profile: { email: "daniellopera@rbcol.co", shortName: "DANIEL LOPERA", modules: [] },
  });
});

test("una cookie con un módulo desconocido cae al menú mínimo", () => {
  const cookie = JSON.stringify({
    via: "conecta",
    profile: { email: "daniellopera@rbcol.co", shortName: null, modules: ["sqf", "superadmin"] },
  });
  assert.deepEqual(parseEntryContext(cookie), {
    via: "conecta",
    profile: { email: "daniellopera@rbcol.co", shortName: null, modules: [] },
  });
});

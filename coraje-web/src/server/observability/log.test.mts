import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildLogLine, scrubText } from "./log";

/**
 * Registro estructurado sin secretos (U10, observabilidad.md §5). Dos
 * garantías: lo que tiene nombre o forma de secreto no sale, y nadie en el
 * servidor escribe en la consola por fuera de `logEvent`.
 */

const NOW = new Date("2026-09-28T12:00:00.000Z");

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

test("una línea JSON con evento, nivel y correlación", () => {
  const line = parse(buildLogLine("warn", "espejo.kick_fallido", { idTicket: "t-1", estadoHttp: 502 }, undefined, NOW));
  assert.deepEqual(line, { ts: "2026-09-28T12:00:00.000Z", nivel: "warn", evento: "espejo.kick_fallido", idTicket: "t-1", estadoHttp: 502 });
});

test("los campos con nombre de secreto se omiten, sea cual sea su valor", () => {
  const line = parse(
    buildLogLine("error", "prueba", {
      refreshToken: "abc",
      accessTokenSealed: "abc",
      "x-coraje-secret": "abc",
      password: "abc",
      cookieValue: "abc",
      cuerpoHtml: "<p>hola</p>",
      body: "{}",
      codigoOtp: "123456",
      enlaceActivacion: "https://x",
      idTicket: "se-conserva",
    }),
  );
  for (const campo of ["refreshToken", "accessTokenSealed", "x-coraje-secret", "password", "cookieValue", "cuerpoHtml", "body", "codigoOtp", "enlaceActivacion"]) {
    assert.equal(line[campo], "[omitido]", campo);
  }
  assert.equal(line.idTicket, "se-conserva");
});

test("los tokens reconocibles se borran también del texto y de los errores", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJh";
  assert.equal(scrubText(`Authorization: Bearer ${jwt}`), "Authorization: [omitido]");
  assert.equal(scrubText(`token ${jwt} final`), "token [omitido] final");
  assert.equal(scrubText("https://n8n/x?code=SECRETO&otro=1"), "https://n8n/x?code=[omitido]&otro=1");

  const line = parse(buildLogLine("error", "correo.graph_rechazo", {}, new Error(`falló con Bearer ${jwt}`)));
  const error = line.error as Record<string, string>;
  assert.equal(error.nombre, "Error");
  assert.equal(error.mensaje, "falló con [omitido]");
  assert.ok(!error.traza.includes(jwt), "la traza tampoco lleva el token");
});

test("un campo no puede sobrescribir ts, nivel ni evento", () => {
  const line = parse(buildLogLine("info", "real", { evento: "falso", nivel: "falso" }, undefined, NOW));
  assert.equal(line.evento, "real");
  assert.equal(line.nivel, "info");
});

test("ningún archivo de la aplicación escribe en la consola por fuera de logEvent", () => {
  const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "generated" || entry === "node_modules") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:ts|tsx)$/.test(entry)) {
        const rel = path.relative(SRC_DIR, full).split(path.sep).join("/");
        if (rel === "server/observability/log.ts") continue;
        if (/\bconsole\.(?:log|info|warn|error|debug|trace)\s*\(/.test(readFileSync(full, "utf8"))) offenders.push(rel);
      }
    }
  };
  walk(SRC_DIR);
  assert.deepEqual(offenders, [], "Usa logEvent (src/server/observability/log.ts)");
});

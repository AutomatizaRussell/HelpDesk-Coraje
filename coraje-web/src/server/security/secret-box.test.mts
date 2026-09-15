import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.HELPDESK_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { sealSecret, openSecret } = await import("./secret-box");

test("sealSecret/openSecret hacen round-trip del valor original", () => {
  const plaintext = JSON.stringify({ state: "abc", nonce: "def", destino: "/tickets" });
  const sealed = sealSecret(plaintext);
  assert.equal(openSecret(sealed), plaintext);
});

test("openSecret rechaza un valor manipulado (tag de autenticación inválido)", () => {
  const sealed = sealSecret("valor-original");
  const parts = sealed.split(".");
  // Corrompe el ciphertext sin tocar el tag: el AEAD debe rechazarlo.
  parts[3] = Buffer.from("manipulado-manipulado-manipulado").toString("base64url");
  const manipulado = parts.join(".");
  assert.throws(() => openSecret(manipulado));
});

test("openSecret rechaza un formato sin las cuatro partes esperadas", () => {
  assert.throws(() => openSecret("no-tiene-el-formato-v1"));
});

test("sealSecret falla explícitamente si la clave no está configurada", async () => {
  const previous = process.env.HELPDESK_TOKEN_ENCRYPTION_KEY;
  delete process.env.HELPDESK_TOKEN_ENCRYPTION_KEY;
  try {
    assert.throws(() => sealSecret("x"));
  } finally {
    process.env.HELPDESK_TOKEN_ENCRYPTION_KEY = previous;
  }
});

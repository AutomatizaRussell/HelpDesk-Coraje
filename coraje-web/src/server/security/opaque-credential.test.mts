import { test } from "node:test";
import assert from "node:assert/strict";

const { createOpaqueCredential, hashOpaqueCredential } = await import(
  "./opaque-credential"
);

test("createOpaqueCredential genera valores distintos en cada llamada", () => {
  const a = createOpaqueCredential();
  const b = createOpaqueCredential();
  assert.notEqual(a, b);
  assert.ok(a.length > 0);
});

test("hashOpaqueCredential es determinístico y distingue entradas distintas", () => {
  const value = createOpaqueCredential();
  assert.equal(hashOpaqueCredential(value), hashOpaqueCredential(value));
  assert.notEqual(hashOpaqueCredential(value), hashOpaqueCredential(createOpaqueCredential()));
});

test("hashOpaqueCredential nunca devuelve el valor plano", () => {
  const value = createOpaqueCredential();
  assert.notEqual(hashOpaqueCredential(value), value);
});

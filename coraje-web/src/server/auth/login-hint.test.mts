import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENTRA_TENANT_ID = "22222222-2222-2222-2222-222222222222";
process.env.ENTRA_CLIENT_ID = "33333333-3333-3333-3333-333333333333";
process.env.ENTRA_CLIENT_SECRET = "test-secret";
process.env.ENTRA_REDIRECT_URI = "https://helpdesk.example/api/auth/microsoft/callback";

const { sanitizeLoginHint } = await import("./login-hint");
const { createAuthorizationRequest } = await import("./entra-oidc");

/**
 * Pista de cuenta y modos de autorización (login-hint.ts, entra-oidc.ts;
 * specs/integracion-conecta.md §2). La pista solo produce un correo bien
 * formado o nada, y nunca viaja en el modo `select`: quien entra directo
 * debe poder elegir cualquier cuenta.
 */

test("sanitizeLoginHint normaliza un correo válido", () => {
  assert.equal(sanitizeLoginHint("  DanielLopera@RBCOL.co "), "daniellopera@rbcol.co");
});

test("sanitizeLoginHint descarta lo que no es un correo", () => {
  for (const value of [undefined, null, "", "sin-arroba", "a@b", "x y@rbcol.co", '"><script>@x.co', `${"a".repeat(250)}@rbcol.co`]) {
    assert.equal(sanitizeLoginHint(value), null, `Debió descartarse: ${String(value)}`);
  }
});

const params = (mode: "silent" | "hinted" | "select", loginHint?: string) =>
  new URL(createAuthorizationRequest({ mode, loginHint }).url).searchParams;

test("modo silent: prompt=none con la pista", () => {
  const p = params("silent", "daniellopera@rbcol.co");
  assert.equal(p.get("prompt"), "none");
  assert.equal(p.get("login_hint"), "daniellopera@rbcol.co");
});

test("modo hinted: interactivo, conserva la pista", () => {
  const p = params("hinted", "daniellopera@rbcol.co");
  assert.equal(p.get("prompt"), null);
  assert.equal(p.get("login_hint"), "daniellopera@rbcol.co");
});

test("modo select: obliga a elegir cuenta y nunca lleva pista", () => {
  const p = params("select", "daniellopera@rbcol.co");
  assert.equal(p.get("prompt"), "select_account");
  assert.equal(p.get("login_hint"), null);
});

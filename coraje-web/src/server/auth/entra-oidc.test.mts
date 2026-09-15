import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const CLIENT_ID = "33333333-3333-3333-3333-333333333333";
const KID = "test-signing-key";

process.env.ENTRA_TENANT_ID = TENANT_ID;
process.env.ENTRA_CLIENT_ID = CLIENT_ID;
process.env.ENTRA_CLIENT_SECRET = "test-secret";
process.env.ENTRA_REDIRECT_URI = "https://helpdesk.example/api/auth/microsoft/callback";

const { validateIdToken } = await import("./entra-oidc");

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function base64url(input: Buffer | string): string {
  return Buffer.from(input as never).toString("base64url");
}

function signToken(
  claims: Record<string, unknown>,
  options: { alg?: string; kid?: string; key?: KeyObject } = {},
): string {
  const header = { alg: options.alg ?? "RS256", kid: options.kid ?? KID, typ: "JWT" };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(claims));
  const signingInput = `${headerPart}.${payloadPart}`;

  if (header.alg === "none") {
    return `${signingInput}.`;
  }

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(options.key ?? privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    aud: CLIENT_ID,
    sub: "subject-1",
    oid: "subject-1",
    tid: TENANT_ID,
    nonce: "expected-nonce",
    exp: now + 3600,
    iat: now,
    preferred_username: "persona@firma.example",
    ...overrides,
  };
}

// Mock de fetch: sirve el JWKS del tenant con la clave pública generada
// arriba, sin tocar la red real.
const originalFetch = globalThis.fetch;
function installJwksMock() {
  globalThis.fetch = (async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/discovery/v2.0/keys")) {
      const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
      return new Response(
        JSON.stringify({ keys: [{ kid: KID, kty: "RSA", n: jwk.n, e: jwk.e }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`fetch no mockeado para: ${url}`);
  }) as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

test("validateIdToken acepta un token válido y devuelve sus claims", async () => {
  installJwksMock();
  try {
    const token = signToken(baseClaims());
    const claims = await validateIdToken({ idToken: token, expectedNonce: "expected-nonce" });
    assert.equal(claims.sub, "subject-1");
    assert.equal(claims.tid, TENANT_ID);
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza alg distinto de RS256 (incluido 'none')", async () => {
  installJwksMock();
  try {
    const token = signToken(baseClaims(), { alg: "none" });
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "expected-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza emisor que no coincide con el tenant configurado", async () => {
  installJwksMock();
  try {
    const token = signToken(
      baseClaims({ iss: "https://login.microsoftonline.com/otro-tenant/v2.0" }),
    );
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "expected-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza audiencia de otra aplicación del mismo tenant", async () => {
  installJwksMock();
  try {
    const token = signToken(baseClaims({ aud: "otra-aplicacion" }));
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "expected-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza nonce que no coincide con el de la petición", async () => {
  installJwksMock();
  try {
    const token = signToken(baseClaims());
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "otro-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza un token expirado más allá de la holgura de reloj", async () => {
  installJwksMock();
  try {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(baseClaims({ exp: now - 300 }));
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "expected-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

test("validateIdToken rechaza una firma inválida (clave distinta a la del tenant)", async () => {
  installJwksMock();
  try {
    const { privateKey: otraClave } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signToken(baseClaims(), { key: otraClave });
    await assert.rejects(() =>
      validateIdToken({ idToken: token, expectedNonce: "expected-nonce" }),
    );
  } finally {
    restoreFetch();
  }
});

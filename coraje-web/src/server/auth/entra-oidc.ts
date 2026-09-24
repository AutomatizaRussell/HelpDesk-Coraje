import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

/**
 * Mecánica del protocolo OIDC con PKCE contra el tenant corporativo de
 * Entra ID (specs/acceso-empleados.md §5). Este módulo no decide admisión ni
 * emite sesión — solo produce y valida los artefactos del protocolo.
 */

// Mail.Send/offline_access: confirmado por el usuario (D6, contexto-canonico.md/
// handoff) que HelpDesk necesitará enviar correo al cliente en nombre del
// empleado que responde. Se piden desde el primer despliegue de identidad,
// aunque el envío en sí no esté construido todavía — pedirlos después
// significa una segunda ronda de consentimiento por cada empleado, y la
// ventana para evitarla es ahora, no cuando aparezca la necesidad.
const SCOPES =
  "openid profile email offline_access https://graph.microsoft.com/Mail.Send";
const CLOCK_SKEW_SECONDS = 120;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const MULTI_TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);

interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function resolveConfig(): EntraConfig {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  const redirectUri = process.env.ENTRA_REDIRECT_URI;

  if (!tenantId || !clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Configuración de Entra ID incompleta: faltan ENTRA_TENANT_ID/ENTRA_CLIENT_ID/ENTRA_CLIENT_SECRET/ENTRA_REDIRECT_URI.",
    );
  }

  // Un tenant explícito, nunca un alias multi-tenant: aceptar 'common' (o
  // similares) validaría cuentas de cualquier organización de Microsoft, no
  // solo la del tenant corporativo — la audiencia del token deja de
  // significar lo que la spec §2 exige.
  if (MULTI_TENANT_ALIASES.has(tenantId)) {
    throw new Error(
      "ENTRA_TENANT_ID no puede ser un alias multi-tenant ('common'/'organizations'/'consumers').",
    );
  }

  return { tenantId, clientId, clientSecret, redirectUri };
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Cómo debe comportarse Entra en la pantalla de autorización:
 *
 * - `silent` (`prompt=none`): sin interacción. Si no puede, responde
 *   `login_required`/`interaction_required` y el llamador reintenta.
 * - `hinted`: interactivo, con la cuenta sugerida. Es el reintento de un
 *   silencioso fallido cuando se sabe qué cuenta usa la persona.
 * - `select` (`prompt=select_account`): obliga a elegir cuenta aunque haya
 *   sesión viva. Es la entrada directa, sin Conecta, por decisión del
 *   24-sep-2026 (specs/integracion-conecta.md §2).
 */
export type AuthorizationMode = "silent" | "hinted" | "select";

export function createAuthorizationRequest(options: {
  mode: AuthorizationMode;
  /** Correo ya saneado (`login-hint.ts`). Nunca se envía en modo `select`. */
  loginHint?: string | null;
}): AuthorizationRequest {
  const config = resolveConfig();

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // prompt=none le pide al proveedor que no interactúe: si hay sesión de
  // tenant viva, devuelve el código de inmediato; si no, responde
  // login_required/interaction_required, y el llamador reintenta sin este
  // parámetro (specs/acceso-empleados.md §4).
  if (options.mode === "silent") params.set("prompt", "none");
  if (options.mode === "select") params.set("prompt", "select_account");

  // Con varias cuentas abiertas en el navegador, prompt=none sin pista
  // responde interaction_required aunque todas tengan sesión (login-hint.ts).
  // En `select` no se envía: ahí la persona debe poder elegir cualquier
  // cuenta, que es justo para lo que existe ese modo.
  if (options.mode !== "select" && options.loginHint) {
    params.set("login_hint", options.loginHint);
  }

  const url = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

  return { url, state, nonce, codeVerifier };
}

export interface EntraTokenSet {
  idToken: string;
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<EntraTokenSet> {
  const config = resolveConfig();

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: config.redirectUri,
    code_verifier: params.codeVerifier,
    scope: SCOPES,
  });

  // Por el canal trasero: el código y el secreto no tocan el navegador
  // (specs/acceso-empleados.md §5, paso 3).
  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Intercambio de código con Entra ID falló (${response.status}).`,
    );
  }

  // La respuesta también trae `refresh_token` y `access_token` (por
  // offline_access y el scope de Graph) — se ignoran deliberadamente aquí:
  // el envío de correo como el empleado (D6) todavía no tiene el mecanismo
  // de custodia (cifrado, renovación, revocación) que ese refresh_token
  // necesitaría para guardarse con seguridad. Pedir el consentimiento ya no
  // implica construir el resto en esta unidad.
  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) {
    throw new Error("La respuesta de token de Entra ID no incluyó id_token.");
  }

  return { idToken: payload.id_token };
}

export interface EntraIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  tid: string;
  oid?: string;
  nonce?: string;
  exp: number;
  nbf?: number;
  preferred_username?: string;
  email?: string;
  name?: string;
}

interface CachedJwks {
  keys: Map<string, KeyObject>;
  fetchedAt: number;
}

let jwksCache: CachedJwks | null = null;

interface MicrosoftJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

async function fetchJwks(tenantId: string): Promise<Map<string, KeyObject>> {
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  );
  if (!response.ok) {
    throw new Error(`No se pudo obtener el JWKS del tenant (${response.status}).`);
  }

  const { keys } = (await response.json()) as { keys: MicrosoftJwk[] };
  const resolved = new Map<string, KeyObject>();
  for (const jwk of keys) {
    if (jwk.kty !== "RSA") continue;
    resolved.set(
      jwk.kid,
      createPublicKey({
        key: { kty: "RSA", n: jwk.n, e: jwk.e },
        format: "jwk",
      }),
    );
  }
  return resolved;
}

async function resolveSigningKey(
  tenantId: string,
  kid: string,
): Promise<KeyObject> {
  const isFresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS;
  if (isFresh && jwksCache!.keys.has(kid)) {
    return jwksCache!.keys.get(kid)!;
  }

  // La clave no está en caché (o el caché venció): refetch forzado. Esto
  // cuesta un request extra en la rotación de claves de Microsoft, no una
  // ventana de logins rechazados.
  const keys = await fetchJwks(tenantId);
  jwksCache = { keys, fetchedAt: Date.now() };

  const key = keys.get(kid);
  if (!key) {
    throw new Error(`Ninguna clave del tenant coincide con kid=${kid}.`);
  }
  return key;
}

function decodeJwtParts(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("id_token con formato inválido.");
  }
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = JSON.parse(
    Buffer.from(headerPart, "base64url").toString("utf8"),
  ) as { alg?: string; kid?: string };
  const claims = JSON.parse(
    Buffer.from(payloadPart, "base64url").toString("utf8"),
  ) as EntraIdTokenClaims;

  return {
    header,
    claims,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: Buffer.from(signaturePart, "base64url"),
  };
}

export async function validateIdToken(params: {
  idToken: string;
  expectedNonce: string;
}): Promise<EntraIdTokenClaims> {
  const config = resolveConfig();
  const { header, claims, signingInput, signature } = decodeJwtParts(
    params.idToken,
  );

  // 1. Firma — alg fijado a RS256 antes de tocar la clave. Aceptar el
  // algoritmo que declara el propio token admite 'none', la falsificación
  // clásica de JWT.
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error(`Algoritmo de firma no soportado: ${header.alg}.`);
  }
  const key = await resolveSigningKey(config.tenantId, header.kid);
  const isValidSignature = cryptoVerify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    key,
    signature,
  );
  if (!isValidSignature) {
    throw new Error("Firma del id_token inválida.");
  }

  // 2. Emisor
  const expectedIssuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  if (claims.iss !== expectedIssuer) {
    throw new Error("Emisor del id_token no coincide con el tenant configurado.");
  }

  // 3. Audiencia — un token acuñado para otra aplicación del mismo tenant no
  // es un ingreso aquí (specs/acceso-empleados.md §2).
  if (claims.aud !== config.clientId) {
    throw new Error("Audiencia del id_token no coincide con esta aplicación.");
  }

  // 4. Nonce
  if (claims.nonce !== params.expectedNonce) {
    throw new Error("Nonce del id_token no coincide con el de la petición.");
  }

  // 5. Expiración con holgura de reloj
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || nowSeconds > claims.exp + CLOCK_SKEW_SECONDS) {
    throw new Error("id_token expirado.");
  }
  if (typeof claims.nbf === "number" && nowSeconds < claims.nbf - CLOCK_SKEW_SECONDS) {
    throw new Error("id_token todavía no es válido (nbf).");
  }

  // El tenant (tid) se valida en la construcción de identidad
  // (employee-admission.ts), deliberadamente separado de esta función: así
  // no se puede saltar llamando directo a la validación de firma.
  return claims;
}

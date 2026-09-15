import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Sellado simétrico (AEAD) para valores que viajan por el navegador pero no
// deben ser legibles ni manipulables desde ahí: la cookie de estado OIDC
// (state/nonce/code_verifier/destino) es el único consumidor hoy.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_ENV_VAR = "HELPDESK_TOKEN_ENCRYPTION_KEY";

/**
 * La clave se lee del entorno en cada llamada, nunca se cachea al importar
 * el módulo. Cachearla al importar convertiría una clave ausente en un
 * fallo de arranque opaco, difícil de relacionar con la variable que falta;
 * leerla aquí hace que el error aparezca en la operación que de verdad la
 * necesitaba (el primer intento de login).
 */
function resolveKey(): Buffer {
  const raw = process.env[KEY_ENV_VAR];
  if (!raw) {
    throw new Error(`${KEY_ENV_VAR} no está configurada.`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV_VAR} debe decodificar a 32 bytes (AES-256).`);
  }
  return key;
}

/**
 * Formato auto-descriptivo: "v1.<iv>.<tag>.<ciphertext>", todo en base64url.
 * La versión permite rotar el esquema de sellado sin ambigüedad futura.
 */
export function sealSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openSecret(sealed: string): string {
  const [version, ivPart, tagPart, ciphertextPart] = sealed.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Formato de secreto sellado inválido.");
  }

  const key = resolveKey();
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function isSecretBoxConfigured(): boolean {
  return Boolean(process.env[KEY_ENV_VAR]);
}

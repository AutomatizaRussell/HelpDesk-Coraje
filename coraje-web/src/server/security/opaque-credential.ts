import { createHash, randomBytes } from "node:crypto";

// 32 bytes de entropía del servidor por credencial — no un secreto elegido
// por una persona. No hay diccionario ni fuerza bruta que atacar aquí, así
// que un SHA-256 plano es suficiente y no paga el costo de un hash de
// contraseña en cada petición (specs/acceso-empleados.md §6).
const CREDENTIAL_BYTES = 32;

export function createOpaqueCredential(): string {
  return randomBytes(CREDENTIAL_BYTES).toString("base64url");
}

export function hashOpaqueCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

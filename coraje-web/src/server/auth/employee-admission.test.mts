import { test } from "node:test";
import assert from "node:assert/strict";

// DATABASE_URL dummy: el módulo importa `@/lib/prisma`, que lanza si falta la
// variable al cargar. Ninguno de los casos probados aquí toca la base real
// (evaluateAdmissionRules es pura; el caso EMAIL_INVALID de
// evaluateDirectoryAdmission retorna antes de consultar Prisma).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.ENTRA_TENANT_ID ??= "00000000-0000-0000-0000-000000000000";

const { evaluateAdmissionRules, evaluateDirectoryAdmission, buildVerifiedIdentity } =
  await import("./employee-admission");

const baseRow = {
  idPersonal: "11111111-1111-1111-1111-111111111111",
  nombreCompleto: "Persona de Prueba",
};

test("evaluateAdmissionRules rechaza NOT_REGISTERED cuando no hay fila", () => {
  const result = evaluateAdmissionRules(null);
  assert.deepEqual(result, { allowed: false, reason: "NOT_REGISTERED" });
});

test("evaluateAdmissionRules rechaza INACTIVE cuando estadoActivo es false", () => {
  const result = evaluateAdmissionRules({
    ...baseRow,
    estadoActivo: false,
    rolAplicacion: "AGENTE",
  });
  assert.deepEqual(result, { allowed: false, reason: "INACTIVE" });
});

test("evaluateAdmissionRules rechaza UNKNOWN_ROLE cuando no hay rol asignado", () => {
  const result = evaluateAdmissionRules({
    ...baseRow,
    estadoActivo: true,
    rolAplicacion: null,
  });
  assert.deepEqual(result, { allowed: false, reason: "UNKNOWN_ROLE" });
});

test("evaluateAdmissionRules admite cuando la fila está activa y tiene rol", () => {
  const result = evaluateAdmissionRules({
    ...baseRow,
    estadoActivo: true,
    rolAplicacion: "AGENTE",
  });
  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.employee.idPersonal, baseRow.idPersonal);
    assert.equal(result.employee.rolAplicacion, "AGENTE");
  }
});

test("evaluateAdmissionRules nunca admite por defecto: ninguna combinación cae en allowed sin fila activa y con rol", () => {
  const casosNegativos = [
    null,
    { ...baseRow, estadoActivo: false, rolAplicacion: null },
    { ...baseRow, estadoActivo: false, rolAplicacion: "AGENTE" },
    { ...baseRow, estadoActivo: true, rolAplicacion: null },
  ];
  for (const caso of casosNegativos) {
    const result = evaluateAdmissionRules(caso as never);
    assert.equal(result.allowed, false, `no debería admitir: ${JSON.stringify(caso)}`);
  }
});

test("evaluateDirectoryAdmission rechaza EMAIL_INVALID sin tocar el directorio", async () => {
  const result = await evaluateDirectoryAdmission({ subject: "sub-1", email: "" });
  assert.deepEqual(result, { allowed: false, reason: "EMAIL_INVALID" });

  const resultMalformado = await evaluateDirectoryAdmission({
    subject: "sub-1",
    email: "no-es-un-correo",
  });
  assert.deepEqual(resultMalformado, { allowed: false, reason: "EMAIL_INVALID" });
});

test("buildVerifiedIdentity rechaza un id_token de un tenant distinto al configurado", () => {
  assert.throws(() =>
    buildVerifiedIdentity({
      iss: "https://login.microsoftonline.com/otro-tenant/v2.0",
      aud: "client",
      sub: "sub-1",
      tid: "otro-tenant",
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as never),
  );
});

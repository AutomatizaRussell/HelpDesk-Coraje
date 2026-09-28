import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/server/observability/log";
import { deriveSubkey } from "@/server/security/secret-box";

import { createDeviceForAuthorization, setDeviceCookie } from "./portal-access";
import { recordPortalAudit } from "./portal-audit";
import { PortalMailError, sendPortalMail } from "./portal-mail";
import { buildCodeMail } from "./portal-mail-content";
import { OTP_CODE_PATTERN, OTP_MAX_ATTEMPTS, OTP_MAX_ISSUES_PER_HOUR, OTP_TTL_MS, normalizeEmail } from "./portal-policy";

/**
 * Ingreso con correo y código para un navegador nuevo (acceso-clientes.md
 * §6): otro navegador, incógnito, cookies borradas o 180 días sin uso (D3).
 *
 * **Diferencia de diseño con Impulsa, y su motivo.** En Impulsa el código se
 * pide desde el enlace de la solicitud, porque el acceso cuelga de ella. Aquí
 * el acceso es continuo y el cliente vuelve cuando tiene un problema nuevo,
 * sin enlace a mano: entra escribiendo su correo. Eso abre una pregunta que
 * Impulsa no tenía —«¿este correo tiene acceso?»— y la respuesta **no se da**:
 * pedir un código responde exactamente igual exista o no el correo, esté o no
 * revocado, se haya alcanzado o no el límite (§9: los mensajes externos no
 * revelan contactos). La diferencia solo queda en la auditoría.
 *
 * Solo pide código un acceso **ya activado**. Uno que todavía no se activó
 * entra por su invitación: un código enviado al correo no sustituye la
 * primera activación que la firma le mandó.
 */

const SERIALIZABLE_RETRIES = 3;

/** HMAC con una subclave del servidor: sin ella, un millón de valores se recorren al instante. */
function codeHash(challengeId: string, code: string): string {
  return createHmac("sha256", deriveSubkey("portal-otp-v1")).update(`${challengeId}:${code}`).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Reintenta una transacción serializable ante conflicto de serialización
 * (P2034). Dos peticiones simultáneas del mismo código, o dos emisiones que
 * cuentan el límite a la vez, no pueden pasar ambas.
 */
async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
    }
  }
  throw lastError;
}

/**
 * Pide un código para el correo escrito.
 *
 * @returns una referencia opaca al desafío, que la acción guarda en una
 *   cookie. Si el correo no tiene acceso, la referencia es un id cualquiera
 *   que no corresponde a nada: la respuesta es indistinguible.
 */
export async function requestPortalCode(rawEmail: string): Promise<string> {
  const correo = normalizeEmail(rawEmail);
  const decoy = randomUUID();

  const target = await prisma.portalContactoCorreo.findFirst({
    where: {
      correo,
      activo: true,
      contacto: {
        activo: true,
        dimClienteContai: { estadoCliente: true },
        autorizaciones: { some: { estado: "ACTIVA", activadaAt: { not: null } } },
      },
    },
    select: {
      id: true,
      contacto: {
        select: {
          id: true,
          nombre: true,
          autorizaciones: { where: { estado: "ACTIVA" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  const idAutorizacion = target?.contacto.autorizaciones[0]?.id;
  if (!target || !idAutorizacion) return decoy;

  const now = new Date();
  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  const issued = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const recent = await tx.portalDesafioOtp.count({
          where: { idAutorizacion, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
        });
        if (recent >= OTP_MAX_ISSUES_PER_HOUR) {
          await recordPortalAudit(tx, {
            evento: "CODIGO_EMITIDO",
            resultado: "FALLO",
            idContacto: target.contacto.id,
            idAutorizacion,
            motivo: "LIMITE_POR_HORA",
          });
          return false;
        }
        // Un código nuevo invalida el anterior (§6).
        await tx.portalDesafioOtp.updateMany({
          where: { idAutorizacion, estado: "ACTIVO" },
          data: { estado: "REEMPLAZADO", updatedAt: now },
        });
        await tx.portalDesafioOtp.create({
          data: {
            id: challengeId,
            idAutorizacion,
            idCorreo: target.id,
            codeHash: codeHash(challengeId, code),
            maxIntentos: OTP_MAX_ATTEMPTS,
            expiraAt: new Date(now.getTime() + OTP_TTL_MS),
          },
        });
        await recordPortalAudit(tx, {
          evento: "CODIGO_EMITIDO",
          resultado: "EXITO",
          idContacto: target.contacto.id,
          idAutorizacion,
          metadata: { idDesafio: challengeId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  // Límite alcanzado: la persona ve lo mismo que siempre. El código anterior,
  // si lo tiene, sigue sirviendo hasta que venza.
  if (!issued) return decoy;

  // Después de responder, con `after()`: si la respuesta esperara a n8n, un
  // correo con acceso tardaría segundos y uno sin acceso volvería al
  // instante, y el tiempo diría lo que el mensaje calla. Fuera de la
  // transacción también por la regla general: una llamada HTTP no retiene
  // una conexión de la base.
  const idContacto = target.contacto.id;
  const nombreContacto = target.contacto.nombre;
  after(() => deliverCode({ challengeId, idAutorizacion, idContacto, nombreContacto, correo, code }));
  return challengeId;
}

/** Entrega el código ya guardado. Nunca lanza: corre cuando la respuesta ya salió. */
async function deliverCode(params: {
  challengeId: string;
  idAutorizacion: string;
  idContacto: string;
  nombreContacto: string;
  correo: string;
  code: string;
}): Promise<void> {
  try {
    const { subject, html } = buildCodeMail({ nombreContacto: params.nombreContacto, codigo: params.code });
    const executionId = await sendPortalMail({ kind: "CODIGO", id: params.challengeId, to: params.correo, subject, html });
    await recordPortalAudit(prisma, {
      evento: "CODIGO_ENVIADO",
      resultado: "EXITO",
      idContacto: params.idContacto,
      idAutorizacion: params.idAutorizacion,
      metadata: { idDesafio: params.challengeId, n8nExecutionId: executionId },
    });
  } catch (error) {
    const message = error instanceof PortalMailError ? error.message : "Fallo inesperado al enviar el código.";
    if (!(error instanceof PortalMailError)) {
      logEvent("error", "portal.codigo_no_enviado", { idContacto: params.idContacto, idDesafio: params.challengeId }, error);
    }
    try {
      // Un código que no llegó no debe quedar vivo: nadie lo recibió.
      await prisma.portalDesafioOtp.updateMany({
        where: { id: params.challengeId, estado: "ACTIVO" },
        data: { estado: "REEMPLAZADO", updatedAt: new Date() },
      });
      await recordPortalAudit(prisma, {
        evento: "CODIGO_ENVIADO",
        resultado: "FALLO",
        idContacto: params.idContacto,
        idAutorizacion: params.idAutorizacion,
        motivo: message,
        metadata: { idDesafio: params.challengeId },
      });
    } catch (auditError) {
      logEvent("error", "portal.fallo_de_codigo_no_auditado", { idContacto: params.idContacto, idDesafio: params.challengeId }, auditError);
    }
  }
}

export type CodeVerification = "VERIFICADO" | "INCORRECTO" | "VENCIDO";

/**
 * Verifica el código y, si es correcto, recuerda este navegador.
 *
 * `INCORRECTO` y `VENCIDO` se distinguen solo para decirle a la persona si
 * vale la pena volver a escribir o si tiene que pedir otro; ninguno revela si
 * el correo tenía acceso, porque a un desafío señuelo le corresponde
 * `VENCIDO` igual que a uno real ya gastado.
 */
export async function verifyPortalCode(challengeRef: string, rawCode: string): Promise<CodeVerification> {
  const code = rawCode.trim();
  if (!OTP_CODE_PATTERN.test(code)) return "INCORRECTO";
  const now = new Date();

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const challenge = await tx.portalDesafioOtp.findUnique({
          where: { id: challengeRef },
          select: {
            id: true,
            estado: true,
            intentos: true,
            maxIntentos: true,
            expiraAt: true,
            codeHash: true,
            idAutorizacion: true,
            autorizacion: {
              select: {
                estado: true,
                activadaAt: true,
                idContacto: true,
                contacto: { select: { activo: true, dimClienteContai: { select: { estadoCliente: true } } } },
              },
            },
          },
        });
        if (!challenge || challenge.estado !== "ACTIVO") return { kind: "VENCIDO" as const };
        if (challenge.expiraAt <= now) {
          await tx.portalDesafioOtp.update({ where: { id: challenge.id }, data: { estado: "VENCIDO", updatedAt: now } });
          return { kind: "VENCIDO" as const };
        }

        if (!sameHash(challenge.codeHash, codeHash(challenge.id, code))) {
          const intentos = challenge.intentos + 1;
          const agotado = intentos >= challenge.maxIntentos;
          await tx.portalDesafioOtp.update({
            where: { id: challenge.id },
            data: { intentos, estado: agotado ? "AGOTADO" : "ACTIVO", updatedAt: now },
          });
          await recordPortalAudit(tx, {
            evento: "CODIGO_FALLIDO",
            resultado: "FALLO",
            idContacto: challenge.autorizacion.idContacto,
            idAutorizacion: challenge.idAutorizacion,
            motivo: agotado ? "AGOTADO" : "CODIGO_INCORRECTO",
            metadata: { idDesafio: challenge.id, intentos },
          });
          return { kind: agotado ? ("VENCIDO" as const) : ("INCORRECTO" as const) };
        }

        // El código es correcto, pero el acceso pudo revocarse mientras tanto.
        const { autorizacion } = challenge;
        const vigente =
          autorizacion.estado === "ACTIVA" &&
          autorizacion.activadaAt !== null &&
          autorizacion.contacto.activo &&
          autorizacion.contacto.dimClienteContai.estadoCliente;
        // La condición sobre intentos es la exclusión: dos envíos simultáneos
        // del mismo código no crean dos dispositivos.
        const verified = await tx.portalDesafioOtp.updateMany({
          where: { id: challenge.id, estado: "ACTIVO", intentos: challenge.intentos },
          data: { estado: vigente ? "VERIFICADO" : "REEMPLAZADO", verificadoAt: vigente ? now : null, updatedAt: now },
        });
        if (verified.count !== 1 || !vigente) return { kind: "VENCIDO" as const };

        const device = await createDeviceForAuthorization(tx, challenge.idAutorizacion);
        await recordPortalAudit(tx, {
          evento: "CODIGO_VERIFICADO",
          resultado: "EXITO",
          idContacto: autorizacion.idContacto,
          idAutorizacion: challenge.idAutorizacion,
          metadata: { idDesafio: challenge.id, idDispositivo: device.idDispositivo },
        });
        return { kind: "VERIFICADO" as const, credential: device.credential };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  if (result.kind !== "VERIFICADO") return result.kind;
  await setDeviceCookie(result.credential);
  return "VERIFICADO";
}

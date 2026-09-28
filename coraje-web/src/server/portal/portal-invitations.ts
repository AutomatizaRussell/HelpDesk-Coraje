import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/features/tickets/format";
import { publicPortalUrl } from "@/server/auth/conecta-return";
import { AuthorizationDeniedError, requireGrant } from "@/server/authorization/authorizer";
import { PORTAL_ACTIONS } from "@/server/authorization/catalog";
import { createOpaqueCredential, hashOpaqueCredential } from "@/server/security/opaque-credential";

import { createDeviceForAuthorization, setDeviceCookie } from "./portal-access";
import { recordPortalAudit } from "./portal-audit";
import { PortalMailError, sendPortalMail } from "./portal-mail";
import { buildInvitationMail } from "./portal-mail-content";
import { INVITATION_TTL_MS, normalizeEmail } from "./portal-policy";

/**
 * Invitaciones al portal (acceso-clientes.md §3, §6, §8).
 *
 * Dos lados, con reglas distintas:
 * - **La firma** da de alta al contacto, le concede acceso e invita. Todo eso
 *   exige `portal.acceso.administrar`, que en la v1 tiene el rol `ADMIN`
 *   (decisión del 28-sep-2026). Los mensajes de error pueden ser precisos:
 *   quien los lee es un empleado autorizado.
 * - **El cliente** abre el enlace y activa. Sin sesión de nadie: el enlace es
 *   la credencial. Del lado externo todas las causas de fallo se ven igual.
 *
 * El enlace en claro solo existe en memoria entre que se emite y se entrega a
 * n8n; la base guarda su hash.
 */

type Tx = Prisma.TransactionClient;

export class PortalAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAdminError";
  }
}

export function isPortalAdminError(error: unknown): error is PortalAdminError {
  return error instanceof PortalAdminError;
}

async function requireAdministrator(idPersonal: string): Promise<void> {
  try {
    await requireGrant(idPersonal, PORTAL_ACTIONS.administrarAccesos);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      throw new PortalAdminError("No tienes permiso para administrar accesos de clientes.");
    }
    throw error;
  }
}

/** Resultado del envío de una invitación, para decírselo a quien la emitió. */
export interface InvitationDelivery {
  enviados: string[];
  fallidos: { correo: string; error: string }[];
}

interface IssuedInvitation {
  idInvitacion: string;
  idAutorizacion: string;
  idContacto: string;
  token: string;
  expiraAt: Date;
}

/**
 * Emite una invitación nueva dentro de la transacción del llamador. Reemplaza
 * la pendiente, si la había: nunca hay dos enlaces vivos para el mismo acceso
 * (lo garantiza también `ux_portal_invitacion_pendiente`).
 */
async function issueInvitation(tx: Tx, params: { idAutorizacion: string; idContacto: string; idPersonal: string }): Promise<IssuedInvitation> {
  const now = new Date();
  await tx.portalInvitacion.updateMany({
    where: { idAutorizacion: params.idAutorizacion, estado: "PENDIENTE" },
    data: { estado: "REEMPLAZADA", updatedAt: now },
  });
  const token = createOpaqueCredential();
  const expiraAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const invitation = await tx.portalInvitacion.create({
    data: {
      idAutorizacion: params.idAutorizacion,
      tokenHash: hashOpaqueCredential(token),
      expiraAt,
      emitidaPor: params.idPersonal,
    },
    select: { id: true },
  });
  await recordPortalAudit(tx, {
    evento: "INVITACION_EMITIDA",
    resultado: "EXITO",
    idContacto: params.idContacto,
    idAutorizacion: params.idAutorizacion,
    idPersonal: params.idPersonal,
    metadata: { idInvitacion: invitation.id },
  });
  return { idInvitacion: invitation.id, idAutorizacion: params.idAutorizacion, idContacto: params.idContacto, token, expiraAt };
}

/**
 * Entrega la invitación ya guardada, **después** del commit: nada sale de la
 * base dentro de una transacción. Va a cada correo activo del contacto, porque
 * ninguno es el principal. Nunca lanza: una invitación que no sale no deshace
 * el acceso concedido, y quien la emitió ve qué falló y puede emitir otra.
 */
async function deliverInvitation(issued: IssuedInvitation, idPersonal: string): Promise<InvitationDelivery> {
  const contacto = await prisma.portalContacto.findUniqueOrThrow({
    where: { id: issued.idContacto },
    select: {
      nombre: true,
      dimClienteContai: { select: { nombreCliente: true } },
      correos: { where: { activo: true }, select: { correo: true } },
    },
  });
  const { subject, html } = buildInvitationMail({
    nombreContacto: contacto.nombre,
    nombreCliente: contacto.dimClienteContai.nombreCliente,
    url: publicPortalUrl(`/portal/activar/${issued.token}`),
    venceEl: formatDate(issued.expiraAt),
  });

  const delivery: InvitationDelivery = { enviados: [], fallidos: [] };
  for (const { correo } of contacto.correos) {
    try {
      const executionId = await sendPortalMail({ kind: "INVITACION", id: issued.idInvitacion, to: correo, subject, html });
      delivery.enviados.push(correo);
      await recordPortalAudit(prisma, {
        evento: "INVITACION_ENVIADA",
        resultado: "EXITO",
        idContacto: issued.idContacto,
        idAutorizacion: issued.idAutorizacion,
        idPersonal,
        metadata: { idInvitacion: issued.idInvitacion, n8nExecutionId: executionId },
      });
    } catch (error) {
      const message = error instanceof PortalMailError ? error.message : "No fue posible enviar la invitación.";
      if (!(error instanceof PortalMailError)) console.error("[portal] Fallo inesperado al enviar la invitación:", error);
      delivery.fallidos.push({ correo, error: message });
      await recordPortalAudit(prisma, {
        evento: "INVITACION_ENVIADA",
        resultado: "FALLO",
        idContacto: issued.idContacto,
        idAutorizacion: issued.idAutorizacion,
        idPersonal,
        motivo: message,
        metadata: { idInvitacion: issued.idInvitacion },
      });
    }
  }
  return delivery;
}

/** Traduce la violación del índice único de correo a un mensaje útil. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

// ---------------------------------------------------------------------------
// Lado de la firma
// ---------------------------------------------------------------------------

/**
 * Da de alta a un contacto de un cliente, le concede acceso y lo invita, en
 * una sola transacción. Si el correo ya pertenece a un contacto activo, no
 * crea nada: un correo identifica a una sola persona.
 */
export async function grantAccessToNewContact(params: {
  idPersonal: string;
  idCliente: string;
  nombre: string;
  correo: string;
}): Promise<{ idContacto: string; delivery: InvitationDelivery }> {
  await requireAdministrator(params.idPersonal);
  const correo = normalizeEmail(params.correo);

  let issued: IssuedInvitation;
  try {
    issued = await prisma.$transaction(async (tx) => {
      const cliente = await tx.dimClienteContai.findUnique({
        where: { idClienteContai: params.idCliente },
        select: { estadoCliente: true },
      });
      if (!cliente) throw new PortalAdminError("El cliente no existe.");
      if (!cliente.estadoCliente) throw new PortalAdminError("El cliente está inactivo: no puede recibir accesos nuevos.");

      const contacto = await tx.portalContacto.create({
        data: {
          idClienteContai: params.idCliente,
          nombre: params.nombre.trim(),
          creadoPor: params.idPersonal,
          correos: { create: { correo } },
        },
        select: { id: true },
      });
      const autorizacion = await tx.portalAutorizacion.create({
        data: { idContacto: contacto.id, concedidaPor: params.idPersonal },
        select: { id: true },
      });
      await recordPortalAudit(tx, {
        evento: "ACCESO_CONCEDIDO",
        resultado: "EXITO",
        idContacto: contacto.id,
        idAutorizacion: autorizacion.id,
        idPersonal: params.idPersonal,
      });
      return issueInvitation(tx, { idAutorizacion: autorizacion.id, idContacto: contacto.id, idPersonal: params.idPersonal });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PortalAdminError("Ese correo ya pertenece a otro contacto con acceso. Un correo identifica a una sola persona.");
    }
    throw error;
  }

  return { idContacto: issued.idContacto, delivery: await deliverInvitation(issued, params.idPersonal) };
}

/**
 * Vuelve a conceder acceso a un contacto cuyo acceso se revocó. Es una
 * autorización nueva, con su propia invitación: revocar no se deshace, y los
 * navegadores de la anterior no sirven para esta (acceso-clientes.md §8).
 */
export async function grantAccessAgain(params: { idPersonal: string; idContacto: string }): Promise<InvitationDelivery> {
  await requireAdministrator(params.idPersonal);
  let issued: IssuedInvitation;
  try {
    issued = await prisma.$transaction(async (tx) => {
      const contacto = await tx.portalContacto.findUnique({
        where: { id: params.idContacto },
        select: { activo: true, dimClienteContai: { select: { estadoCliente: true } } },
      });
      if (!contacto || !contacto.activo) throw new PortalAdminError("El contacto no existe o está inactivo.");
      if (!contacto.dimClienteContai.estadoCliente) throw new PortalAdminError("El cliente está inactivo.");

      const autorizacion = await tx.portalAutorizacion.create({
        data: { idContacto: params.idContacto, concedidaPor: params.idPersonal },
        select: { id: true },
      });
      await recordPortalAudit(tx, {
        evento: "ACCESO_CONCEDIDO",
        resultado: "EXITO",
        idContacto: params.idContacto,
        idAutorizacion: autorizacion.id,
        idPersonal: params.idPersonal,
      });
      return issueInvitation(tx, { idAutorizacion: autorizacion.id, idContacto: params.idContacto, idPersonal: params.idPersonal });
    });
  } catch (error) {
    // ux_portal_autorizacion_activa: ya tiene una activa.
    if (isUniqueViolation(error)) throw new PortalAdminError("Este contacto ya tiene un acceso activo.");
    throw error;
  }
  return deliverInvitation(issued, params.idPersonal);
}

/**
 * Emite otra invitación para un acceso que todavía no se activó (se perdió el
 * correo, venció el enlace). Un acceso ya activado no necesita invitación: el
 * contacto entra desde otro navegador con su correo y un código.
 */
export async function reissueInvitation(params: { idPersonal: string; idAutorizacion: string }): Promise<InvitationDelivery> {
  await requireAdministrator(params.idPersonal);
  const issued = await prisma.$transaction(async (tx) => {
    const autorizacion = await tx.portalAutorizacion.findUnique({
      where: { id: params.idAutorizacion },
      select: { estado: true, activadaAt: true, idContacto: true, contacto: { select: { activo: true } } },
    });
    if (!autorizacion || autorizacion.estado !== "ACTIVA" || !autorizacion.contacto.activo) {
      throw new PortalAdminError("Este acceso ya no está activo.");
    }
    if (autorizacion.activadaAt) {
      throw new PortalAdminError("Este acceso ya se activó. El contacto puede entrar con su correo y un código.");
    }
    return issueInvitation(tx, { idAutorizacion: params.idAutorizacion, idContacto: autorizacion.idContacto, idPersonal: params.idPersonal });
  });
  return deliverInvitation(issued, params.idPersonal);
}

/**
 * Revoca un acceso: la autorización, su invitación pendiente, sus códigos
 * vivos y sus navegadores, en una transacción. **No cancela trabajo**: los
 * tickets abiertos del contacto siguen su curso (§8).
 */
export async function revokeAccess(params: { idPersonal: string; idAutorizacion: string; motivo: string }): Promise<void> {
  await requireAdministrator(params.idPersonal);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const revoked = await tx.portalAutorizacion.updateMany({
      where: { id: params.idAutorizacion, estado: "ACTIVA" },
      data: {
        estado: "REVOCADA",
        revocadaAt: now,
        revocadaPor: params.idPersonal,
        motivoRevocacion: params.motivo.slice(0, 500),
        updatedAt: now,
      },
    });
    if (revoked.count !== 1) throw new PortalAdminError("Este acceso ya estaba revocado.");

    await tx.portalInvitacion.updateMany({
      where: { idAutorizacion: params.idAutorizacion, estado: "PENDIENTE" },
      data: { estado: "REVOCADA", updatedAt: now },
    });
    await tx.portalDesafioOtp.updateMany({
      where: { idAutorizacion: params.idAutorizacion, estado: "ACTIVO" },
      data: { estado: "REEMPLAZADO", updatedAt: now },
    });
    await tx.portalDispositivo.updateMany({
      where: { idAutorizacion: params.idAutorizacion, estado: "ACTIVO" },
      data: { estado: "REVOCADO", revocadoAt: now },
    });
    const autorizacion = await tx.portalAutorizacion.findUniqueOrThrow({
      where: { id: params.idAutorizacion },
      select: { idContacto: true },
    });
    await recordPortalAudit(tx, {
      evento: "ACCESO_REVOCADO",
      resultado: "EXITO",
      idContacto: autorizacion.idContacto,
      idAutorizacion: params.idAutorizacion,
      idPersonal: params.idPersonal,
      motivo: params.motivo,
    });
  });
}

/**
 * Pasa un acceso a solo lectura o lo devuelve a escritura. Solo lectura deja
 * consultar e impide radicar, y lo impide en servidor
 * (`requirePortalWriteAccess`).
 */
export async function setReadOnly(params: { idPersonal: string; idAutorizacion: string; soloLectura: boolean }): Promise<void> {
  await requireAdministrator(params.idPersonal);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.portalAutorizacion.updateMany({
      where: { id: params.idAutorizacion, estado: "ACTIVA" },
      data: { soloLectura: params.soloLectura, updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new PortalAdminError("Este acceso ya no está activo.");
    const autorizacion = await tx.portalAutorizacion.findUniqueOrThrow({
      where: { id: params.idAutorizacion },
      select: { idContacto: true },
    });
    await recordPortalAudit(tx, {
      evento: "SOLO_LECTURA_CAMBIADO",
      resultado: "EXITO",
      idContacto: autorizacion.idContacto,
      idAutorizacion: params.idAutorizacion,
      idPersonal: params.idPersonal,
      metadata: { soloLectura: params.soloLectura },
    });
  });
}

// ---------------------------------------------------------------------------
// Lado del cliente
// ---------------------------------------------------------------------------

export type InvitationView =
  | { kind: "PENDIENTE"; nombreContacto: string; nombreCliente: string }
  | { kind: "USADA" }
  | { kind: "NO_DISPONIBLE" };

/**
 * Qué mostrar al abrir un enlace. **No consume nada**: abrir el enlace es un
 * GET, y los filtros de correo (Safe Links y similares) hacen GET a cada
 * enlace antes que la persona. La activación es una acción explícita
 * (`activateInvitation`), nunca un efecto de visitar la página.
 *
 * `USADA` se distingue de `NO_DISPONIBLE` porque quien la ve tiene el enlace,
 * que es el secreto: no se le revela nada que no tenga ya.
 */
export async function inspectInvitation(token: string): Promise<InvitationView> {
  const invitation = await prisma.portalInvitacion.findUnique({
    where: { tokenHash: hashOpaqueCredential(token.trim()) },
    select: {
      estado: true,
      expiraAt: true,
      autorizacion: {
        select: {
          estado: true,
          contacto: {
            select: { nombre: true, activo: true, dimClienteContai: { select: { nombreCliente: true, estadoCliente: true } } },
          },
        },
      },
    },
  });
  if (!invitation) return { kind: "NO_DISPONIBLE" };
  const { autorizacion } = invitation;
  const vigente =
    autorizacion.estado === "ACTIVA" && autorizacion.contacto.activo && autorizacion.contacto.dimClienteContai.estadoCliente;
  if (!vigente) return { kind: "NO_DISPONIBLE" };
  if (invitation.estado === "CONSUMIDA") return { kind: "USADA" };
  if (invitation.estado !== "PENDIENTE" || invitation.expiraAt <= new Date()) return { kind: "NO_DISPONIBLE" };
  return {
    kind: "PENDIENTE",
    nombreContacto: autorizacion.contacto.nombre,
    nombreCliente: autorizacion.contacto.dimClienteContai.nombreCliente,
  };
}

/**
 * Primera activación, sin código (§6, paso 3): consume la invitación de forma
 * atómica, sella la autorización como activada y recuerda este navegador.
 *
 * La exclusión es el `updateMany` condicionado: si dos pestañas activan a la
 * vez, solo una consume y la otra falla. Un enlace consumido no autentica
 * otro navegador aunque se reenvíe (§6, paso 6).
 *
 * @returns `true` si activó; `false` si el enlace no sirve, sin decir por qué.
 */
export async function activateInvitation(token: string): Promise<boolean> {
  const tokenHash = hashOpaqueCredential(token.trim());
  const now = new Date();

  const activated = await prisma.$transaction(async (tx) => {
    const invitation = await tx.portalInvitacion.findUnique({
      where: { tokenHash },
      select: {
        id: true,
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
    if (!invitation) return null;
    const { autorizacion } = invitation;
    if (autorizacion.estado !== "ACTIVA" || !autorizacion.contacto.activo || !autorizacion.contacto.dimClienteContai.estadoCliente) {
      return null;
    }

    const consumed = await tx.portalInvitacion.updateMany({
      where: { id: invitation.id, estado: "PENDIENTE", expiraAt: { gt: now } },
      data: { estado: "CONSUMIDA", consumidaAt: now, updatedAt: now },
    });
    if (consumed.count !== 1) return null;

    if (!autorizacion.activadaAt) {
      await tx.portalAutorizacion.update({ where: { id: invitation.idAutorizacion }, data: { activadaAt: now, updatedAt: now } });
    }
    const device = await createDeviceForAuthorization(tx, invitation.idAutorizacion);
    await recordPortalAudit(tx, {
      evento: "INVITACION_ACTIVADA",
      resultado: "EXITO",
      idContacto: autorizacion.idContacto,
      idAutorizacion: invitation.idAutorizacion,
      metadata: { idInvitacion: invitation.id, idDispositivo: device.idDispositivo },
    });
    return device.credential;
  });

  if (!activated) return false;
  await setDeviceCookie(activated);
  return true;
}

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/server/observability/log";
import { createOpaqueCredential, hashOpaqueCredential } from "@/server/security/opaque-credential";

import { recordPortalAudit } from "./portal-audit";
import { PORTAL_COOKIE_PATH, PORTAL_DEVICE_COOKIE } from "./portal-cookie";
import { DEVICE_COOKIE_MAX_AGE_SECONDS, DEVICE_TOUCH_THROTTLE_MS, evaluatePortalAccess } from "./portal-policy";

/**
 * Identidad del cliente en el portal: el navegador recordado
 * (acceso-clientes.md §6). Es la segunda capa del perímetro del portal —el
 * proxy solo comprueba que la cookie **existe**— y el único punto que decide
 * si esa cookie corresponde a un acceso vivo. Nada fuera de
 * `src/server/portal/` lee la cookie.
 *
 * Cada lectura relee la base: revocar un acceso, desactivar el contacto o el
 * cliente surte efecto en la siguiente petición, sin esperar a que caduque
 * nada en el navegador.
 */

type Tx = Prisma.TransactionClient;

export interface PortalAccess {
  idContacto: string;
  nombreContacto: string;
  idCliente: string;
  nombreCliente: string;
  idAutorizacion: string;
  idDispositivo: string;
  soloLectura: boolean;
}

async function readDeviceCredential(): Promise<string | null> {
  return (await cookies()).get(PORTAL_DEVICE_COOKIE)?.value?.trim() || null;
}

/**
 * Crea el dispositivo de una autorización y devuelve la credencial en claro,
 * que solo existe en la respuesta que la pone en la cookie. Se llama dentro
 * de la transacción que activa (invitación o código): si la activación no se
 * guarda, tampoco queda dispositivo.
 */
export async function createDeviceForAuthorization(tx: Tx, idAutorizacion: string): Promise<{ credential: string; idDispositivo: string }> {
  const credential = createOpaqueCredential();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 400) ?? null;
  const device = await tx.portalDispositivo.create({
    data: { idAutorizacion, credentialHash: hashOpaqueCredential(credential), userAgent },
    select: { id: true },
  });
  return { credential, idDispositivo: device.id };
}

/**
 * Pone la credencial en el navegador. Solo desde una acción de servidor o un
 * route handler: en un render, Next no admite escribir cookies.
 */
export async function setDeviceCookie(credential: string): Promise<void> {
  (await cookies()).set(PORTAL_DEVICE_COOKIE, credential, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax y no strict: el cliente llega al portal desde el enlace de un
    // correo, que es una navegación de otro sitio. Las mutaciones van por
    // Server Actions, que Next protege comparando Origin con Host.
    sameSite: "lax",
    path: PORTAL_COOKIE_PATH,
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    priority: "high",
  });
}

/**
 * El acceso de este navegador, o `null` si no tiene uno vivo. Nunca lanza por
 * una credencial mala: un navegador sin acceso es el caso normal de quien
 * todavía no entró.
 */
export async function resolvePortalAccess(): Promise<PortalAccess | null> {
  const credential = await readDeviceCredential();
  if (!credential) return null;

  const device = await prisma.portalDispositivo.findUnique({
    where: { credentialHash: hashOpaqueCredential(credential) },
    select: {
      id: true,
      estado: true,
      ultimoUsoAt: true,
      autorizacion: {
        select: {
          id: true,
          estado: true,
          activadaAt: true,
          soloLectura: true,
          contacto: {
            select: {
              id: true,
              nombre: true,
              activo: true,
              dimClienteContai: { select: { idClienteContai: true, nombreCliente: true, estadoCliente: true } },
            },
          },
        },
      },
    },
  });
  if (!device) return null;

  const { autorizacion } = device;
  const { contacto } = autorizacion;
  const now = new Date();
  const denial = evaluatePortalAccess(
    {
      dispositivo: { estado: device.estado, ultimoUsoAt: device.ultimoUsoAt },
      autorizacion: { estado: autorizacion.estado, activadaAt: autorizacion.activadaAt },
      contactoActivo: contacto.activo,
      clienteActivo: contacto.dimClienteContai.estadoCliente,
    },
    now,
  );
  if (denial) {
    // Al registro del servidor, no a la persona ni a la auditoría: una fila
    // por cada página pedida con una cookie vieja no aporta evidencia nueva.
    logEvent("warn", "portal.acceso_denegado", { motivo: denial, idDispositivo: device.id, idContacto: contacto.id });
    return null;
  }

  if (now.getTime() - device.ultimoUsoAt.getTime() > DEVICE_TOUCH_THROTTLE_MS) {
    await prisma.portalDispositivo.update({ where: { id: device.id }, data: { ultimoUsoAt: now } });
  }

  return {
    idContacto: contacto.id,
    nombreContacto: contacto.nombre,
    idCliente: contacto.dimClienteContai.idClienteContai,
    nombreCliente: contacto.dimClienteContai.nombreCliente,
    idAutorizacion: autorizacion.id,
    idDispositivo: device.id,
    soloLectura: autorizacion.soloLectura,
  };
}

/** Exige un acceso vivo o manda al ingreso por correo y código. */
export async function requirePortalAccess(): Promise<PortalAccess> {
  const access = await resolvePortalAccess();
  if (!access) redirect("/portal/ingreso");
  return access;
}

export class PortalReadOnlyError extends Error {
  constructor() {
    super("Tu acceso al portal es solo de consulta.");
    this.name = "PortalReadOnlyError";
  }
}

/**
 * Exige un acceso que además pueda escribir. Solo lectura bloquea **en
 * servidor**, no solo ocultando el botón (acceso-clientes.md §7, §10).
 *
 * @throws {PortalReadOnlyError} si el acceso es de solo lectura.
 */
export async function requirePortalWriteAccess(): Promise<PortalAccess> {
  const access = await requirePortalAccess();
  if (access.soloLectura) throw new PortalReadOnlyError();
  return access;
}

/**
 * Cierra el acceso de **este** navegador: el dispositivo se revoca en
 * servidor y la cookie se borra. Los demás navegadores del contacto siguen
 * entrando; para cerrarlos todos, quien administra accesos revoca la
 * autorización.
 */
export async function signOutPortalDevice(): Promise<void> {
  const credential = await readDeviceCredential();
  if (credential) {
    const now = new Date();
    const device = await prisma.portalDispositivo.findUnique({
      where: { credentialHash: hashOpaqueCredential(credential) },
      select: { id: true, estado: true, idAutorizacion: true },
    });
    if (device && device.estado === "ACTIVO") {
      await prisma.$transaction(async (tx) => {
        await tx.portalDispositivo.update({ where: { id: device.id }, data: { estado: "REVOCADO", revocadoAt: now } });
        await recordPortalAudit(tx, {
          evento: "SALIDA",
          resultado: "EXITO",
          idAutorizacion: device.idAutorizacion,
          metadata: { idDispositivo: device.id },
        });
      });
    }
  }
  (await cookies()).delete({ name: PORTAL_DEVICE_COOKIE, path: PORTAL_COOKIE_PATH });
}

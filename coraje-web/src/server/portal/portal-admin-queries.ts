import { prisma } from "@/lib/prisma";
import { resolveGrant } from "@/server/authorization/authorizer";
import { PORTAL_ACTIONS } from "@/server/authorization/catalog";

/**
 * Lecturas de la consola de accesos de clientes (acceso-clientes.md §11,
 * entrega 6: consultar, reenviar, revocar). Todas exigen
 * `portal.acceso.administrar`; sin él devuelven `null` y la vista responde
 * como si la ruta no existiera.
 */

export async function canAdministerAccess(idPersonal: string): Promise<boolean> {
  return (await resolveGrant(idPersonal, PORTAL_ACTIONS.administrarAccesos)) !== null;
}

export interface ClientSearchRow {
  idCliente: string;
  nombre: string;
  identificacionFiscal: string | null;
  activo: boolean;
  contactos: number;
}

/** Mínimo de caracteres para buscar: con uno solo, la lista es todo el catálogo. */
export const CLIENT_SEARCH_MIN_LENGTH = 2;
const CLIENT_SEARCH_LIMIT = 25;

/**
 * Busca clientes por nombre o identificación fiscal. La búsqueda la hace la
 * base (`ILIKE`), no la aplicación sobre la lista completa.
 */
export async function searchClients(idPersonal: string, query: string): Promise<ClientSearchRow[] | null> {
  if (!(await canAdministerAccess(idPersonal))) return null;
  const term = query.trim();
  if (term.length < CLIENT_SEARCH_MIN_LENGTH) return [];
  const clientes = await prisma.dimClienteContai.findMany({
    where: {
      OR: [
        { nombreCliente: { contains: term, mode: "insensitive" } },
        { identificacionFiscal: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { nombreCliente: "asc" },
    take: CLIENT_SEARCH_LIMIT,
    select: {
      idClienteContai: true,
      nombreCliente: true,
      identificacionFiscal: true,
      estadoCliente: true,
      _count: { select: { portalContacto: true } },
    },
  });
  return clientes.map((cliente) => ({
    idCliente: cliente.idClienteContai,
    nombre: cliente.nombreCliente,
    identificacionFiscal: cliente.identificacionFiscal,
    activo: cliente.estadoCliente,
    contactos: cliente._count.portalContacto,
  }));
}

/** Estado del acceso de un contacto, derivado de su autorización más reciente. */
export type ContactAccessState = "SIN_ACCESO" | "INVITADO" | "ACTIVO" | "REVOCADO";

export interface ContactAccessRow {
  idContacto: string;
  nombre: string;
  activo: boolean;
  correos: string[];
  estado: ContactAccessState;
  idAutorizacion: string | null;
  soloLectura: boolean;
  activadoEl: Date | null;
  revocadoEl: Date | null;
  motivoRevocacion: string | null;
  invitacionVence: Date | null;
  ultimoEnvio: { exito: boolean; fecha: Date; motivo: string | null } | null;
  navegadores: number;
}

export interface ClientAccessOverview {
  idCliente: string;
  nombre: string;
  identificacionFiscal: string | null;
  activo: boolean;
  contactos: ContactAccessRow[];
}

export async function getClientAccessOverview(idPersonal: string, idCliente: string): Promise<ClientAccessOverview | null> {
  if (!(await canAdministerAccess(idPersonal))) return null;
  const cliente = await prisma.dimClienteContai.findUnique({
    where: { idClienteContai: idCliente },
    select: {
      idClienteContai: true,
      nombreCliente: true,
      identificacionFiscal: true,
      estadoCliente: true,
      portalContacto: {
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          activo: true,
          correos: { where: { activo: true }, orderBy: { createdAt: "asc" }, select: { correo: true } },
          autorizaciones: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              estado: true,
              soloLectura: true,
              activadaAt: true,
              revocadaAt: true,
              motivoRevocacion: true,
              invitaciones: { where: { estado: "PENDIENTE" }, select: { expiraAt: true }, take: 1 },
              dispositivos: { where: { estado: "ACTIVO" }, select: { id: true } },
              auditoria: {
                where: { evento: "INVITACION_ENVIADA" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { resultado: true, createdAt: true, motivo: true },
              },
            },
          },
        },
      },
    },
  });
  if (!cliente) return null;

  return {
    idCliente: cliente.idClienteContai,
    nombre: cliente.nombreCliente,
    identificacionFiscal: cliente.identificacionFiscal,
    activo: cliente.estadoCliente,
    contactos: cliente.portalContacto.map((contacto): ContactAccessRow => {
      const acceso = contacto.autorizaciones[0] ?? null;
      const estado: ContactAccessState = !acceso
        ? "SIN_ACCESO"
        : acceso.estado === "REVOCADA"
          ? "REVOCADO"
          : acceso.activadaAt
            ? "ACTIVO"
            : "INVITADO";
      const envio = acceso?.auditoria[0] ?? null;
      return {
        idContacto: contacto.id,
        nombre: contacto.nombre,
        activo: contacto.activo,
        correos: contacto.correos.map((row) => row.correo),
        estado,
        idAutorizacion: acceso?.id ?? null,
        soloLectura: acceso?.soloLectura ?? false,
        activadoEl: acceso?.activadaAt ?? null,
        revocadoEl: acceso?.revocadaAt ?? null,
        motivoRevocacion: acceso?.motivoRevocacion ?? null,
        invitacionVence: acceso?.invitaciones[0]?.expiraAt ?? null,
        ultimoEnvio: envio ? { exito: envio.resultado === "EXITO", fecha: envio.createdAt, motivo: envio.motivo } : null,
        // Los navegadores inactivos siguen ACTIVO en la base hasta que alguien
        // los revoque; la regla de 180 días se aplica al leer, no aquí.
        navegadores: acceso?.dispositivos.length ?? 0,
      };
    }),
  };
}

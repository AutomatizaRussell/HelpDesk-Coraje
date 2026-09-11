import { prisma } from "@/lib/prisma";

/**
 * Obtiene tickets creados desde el portal de clientes que aún no han sido
 * redirigidos a un área.
 *
 * Regla de negocio:
 * - origenSistema = PORTAL_CLIENTE
 * - estado = ABIERTO
 * - idAreaDestino IS NULL
 *
 * Estos tickets todavía no deben enviarse a SharePoint/PowerApps hasta que
 * el empleado redireccionador seleccione área, tipo y categoría.
 */
export async function getPendingRedirectTickets() {
  return prisma.factTicket.findMany({
    where: {
      origenSistema: "PORTAL_CLIENTE",
      idAreaDestino: null,
      dimEstado: {
        nombreEstado: "ABIERTO",
      },
    },
    orderBy: {
      fechaCreacion: "asc",
    },
    select: {
      idTicket: true,
      codigoTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      fechaLimite: true,
      dimClienteContai: {
        select: {
          nombreCliente: true,
          identificacionFiscal: true,
        },
      },
      dimEstado: {
        select: {
          nombreEstado: true,
        },
      },
    },
  });
}

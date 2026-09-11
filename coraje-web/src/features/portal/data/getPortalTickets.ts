import { prisma } from "@/lib/prisma";

/**
 * Obtiene los tickets visibles para el cliente seleccionado en el portal.
 *
 * Reglas actuales:
 * - Filtra por idClienteContai del cliente seleccionado en la cookie temporal.
 * - Filtra por origenSistema = PORTAL_CLIENTE.
 * - No muestra tickets legacy mientras el acceso siga siendo falso/temporal,
 *   porque cualquier usuario podría seleccionar cualquier cliente.
 *
 * Campos importantes:
 * - idTicket: necesario para acciones como eliminar tickets no redirigidos.
 * - idAreaDestino: permite saber si el ticket ya fue redirigido.
 * - idTipoReq: permite saber si el ticket ya fue clasificado.
 * - dimEstado.nombreEstado: permite traducir estado técnico a estado visible.
 */
export async function getPortalTickets(clientId: string) {
  const tickets = await prisma.factTicket.findMany({
    where: {
      idClienteContai: clientId,
      origenSistema: "PORTAL_CLIENTE",
    },
    orderBy: {
      fechaCreacion: "desc",
    },
    select: {
      idTicket: true,
      codigoTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      fechaLimite: true,
      fechaResolucion: true,
      respuestaFinal: true,
      idAreaDestino: true,
      idTipoReq: true,
      dimEstado: {
        select: {
          nombreEstado: true,
        },
      },
    },
  });



  return tickets;
}

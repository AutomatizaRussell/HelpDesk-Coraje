import { prisma } from "@/lib/prisma";

/**
 * Obtiene un ticket específico para redirección.
 *
 * Regla de negocio:
 * - Solo se permite redirigir tickets creados desde el portal.
 * - Solo se permite redirigir tickets sin área destino.
 * - Solo se permite redirigir tickets en estado ABIERTO.
 *
 * Si el ticket no cumple esas condiciones, devuelve null.
 */
export async function getRedirectTicket(ticketId: string) {
  return prisma.factTicket.findFirst({
    where: {
      idTicket: ticketId,
      origenSistema: "PORTAL_CLIENTE",
      idAreaDestino: null,
      dimEstado: {
        nombreEstado: "ABIERTO",
      },
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
          tipoCliente: true,
          grupoEconomico: true,
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

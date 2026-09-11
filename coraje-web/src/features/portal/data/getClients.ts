import { prisma } from "@/lib/prisma";

/**
 * Obtiene una primera página de clientes activos para inicializar el selector.
 *
 * La búsqueda completa e incremental se hace después mediante:
 * /api/portal/clientes
 */
export async function getClients(search?: string) {
  const normalizedSearch = search?.trim();

  return prisma.dimClienteContai.findMany({
    where: {
      estadoCliente: true,
      ...(normalizedSearch
        ? {
            OR: [
              {
                nombreCliente: {
                  contains: normalizedSearch,
                  mode: "insensitive",
                },
              },
              {
                identificacionFiscal: {
                  contains: normalizedSearch,
                  mode: "insensitive",
                },
              },
              {
                grupoEconomico: {
                  contains: normalizedSearch,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      {
        nombreCliente: "asc",
      },
      {
        idClienteContai: "asc",
      },
    ],
    take: 25,
    select: {
      idClienteContai: true,
      nombreCliente: true,
      identificacionFiscal: true,
      tipoCliente: true,
      grupoEconomico: true,
    },
  });
}

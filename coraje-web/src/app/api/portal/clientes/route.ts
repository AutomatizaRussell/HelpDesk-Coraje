import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Endpoint de búsqueda server-side para el selector temporal de clientes.
 *
 * Parámetros:
 * - search: texto libre para buscar por nombre, identificación fiscal o grupo.
 * - page: página basada en offset.
 * - pageSize: tamaño de página, limitado para evitar abuso accidental.
 *
 * Este endpoint existe porque cargar todos los clientes al navegador no escala.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search")?.trim() ?? "";
  const page = Number(searchParams.get("page") ?? "0");
  const requestedPageSize = Number(searchParams.get("pageSize") ?? "25");

  const safePage = Number.isFinite(page) && page >= 0 ? page : 0;

  /**
   * Límite defensivo.
   *
   * Aunque el front pida más, no devolvemos más de 50 registros por llamada.
   * Esto evita respuestas enormes y mantiene el dropdown usable.
   */
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 50)
      : 25;

  const where = {
    estadoCliente: true,
    ...(search
      ? {
          OR: [
            {
              nombreCliente: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
            {
              identificacionFiscal: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
            {
              grupoEconomico: {
                contains: search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  /**
   * Pedimos pageSize + 1 para saber si existe una página siguiente.
   * El registro adicional no se devuelve al cliente.
   */
  const rows = await prisma.dimClienteContai.findMany({
    where,
    orderBy: [
      {
        nombreCliente: "asc",
      },
      {
        idClienteContai: "asc",
      },
    ],
    skip: safePage * pageSize,
    take: pageSize + 1,
    select: {
      idClienteContai: true,
      nombreCliente: true,
      identificacionFiscal: true,
      tipoCliente: true,
      grupoEconomico: true,
    },
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return NextResponse.json({
    items,
    nextPage: hasMore ? safePage + 1 : null,
  });
}
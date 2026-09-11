import { prisma } from "@/lib/prisma";

/**
 * Obtiene el catálogo necesario para redirigir tickets.
 *
 * La dependencia funcional es:
 * área → tipo requerimiento → categoría 1 → categoría 2 opcional.
 *
 * La tabla dim_tipo_requerimiento ya contiene la combinación completa.
 * Por eso devolvemos las filas planas y el componente cliente filtra en cascada.
 */
export async function getRedirectCatalog() {
  const [areas, tiposRequerimiento] = await Promise.all([
    prisma.dimArea.findMany({
      orderBy: {
        nombreArea: "asc",
      },
      select: {
        idArea: true,
        nombreArea: true,
      },
    }),

    prisma.dimTipoRequerimiento.findMany({
      orderBy: [
        {
          tipoRequerimiento: "asc",
        },
        {
          categoria1: "asc",
        },
        {
          categoria2: "asc",
        },
      ],
      select: {
        idTipoReq: true,
        idArea: true,
        tipoRequerimiento: true,
        categoria1: true,
        categoria2: true,
      },
    }),
  ]);

  return {
    areas,
    tiposRequerimiento,
  };
}

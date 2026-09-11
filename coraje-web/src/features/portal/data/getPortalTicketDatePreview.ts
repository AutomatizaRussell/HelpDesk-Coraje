import { prisma } from "@/lib/prisma";

type TicketDatePreview = {
  fechaCreacion: Date;
  fechaLimite: Date;
  diasSla: number;
};

/**
 * Calcula la previsualización de fechas para un ticket nuevo de cliente.
 *
 * Reglas actuales:
 * - La fecha de creación es CURRENT_DATE en PostgreSQL.
 * - La prioridad de tickets de cliente es MEDIA.
 * - La fecha límite se calcula con el calendario hábil colombiano.
 *
 * Esta función usa PostgreSQL como fuente de verdad para evitar diferencias
 * entre reloj de servidor, cliente y base de datos.
 */
export async function getPortalTicketDatePreview(): Promise<TicketDatePreview> {
  const prioridadMedia = await prisma.dimPrioridad.findUnique({
    where: {
      nombrePrioridad: "MEDIA",
    },
    select: {
      diasSla: true,
    },
  });

  if (!prioridadMedia) {
    throw new Error("No existe la prioridad MEDIA en helpdesk.dim_prioridad.");
  }

  // SQL crudo: los nombres de columna aquí son los de la fila devuelta por la
  // consulta, no del modelo Prisma — permanecen en snake_case porque son alias
  // de SELECT, no @map de un modelo.
  const rows = await prisma.$queryRaw<
    {
      fecha_creacion: Date;
      fecha_limite: Date;
      dias_sla: number;
    }[]
  >`
    SELECT
      CURRENT_DATE::date AS fecha_creacion,
      core.add_colombia_business_days(
        CURRENT_DATE,
        ${prioridadMedia.diasSla}
      )::date AS fecha_limite,
      ${prioridadMedia.diasSla}::integer AS dias_sla
  `;

  const preview = rows[0];

  if (!preview) {
    throw new Error("No fue posible calcular la previsualización de fechas.");
  }

  return {
    fechaCreacion: preview.fecha_creacion,
    fechaLimite: preview.fecha_limite,
    diasSla: preview.dias_sla,
  };
}
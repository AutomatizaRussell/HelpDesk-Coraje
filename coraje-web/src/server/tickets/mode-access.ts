import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { resolveGrants } from "@/server/authorization/authorizer";
import { PORTAL_ACTIONS, TICKET_ACTIONS } from "@/server/authorization/catalog";
import { consultScopeConditions } from "@/server/authorization/scope";

import { canRedirect, countUnredirected } from "./redirect-queries";
import { modeCondition, type TicketMode } from "./ticket-mode";
import { OPEN_STATES } from "./ticket-state";

/**
 * Quién usa el modo Coraje (U17), decidido **por permiso, nunca por rol**
 * (decisión del usuario del 01-oct-2026). Ve el interruptor quien tenga
 * trabajo con clientes:
 *
 * - puede redirigir los tickets del portal (`ticket.redirigir`);
 * - puede administrar los accesos de clientes (`portal.acceso.administrar`);
 * - o tiene algún ticket de cliente dentro de su alcance de consulta, sea
 *   porque lo recibe su área, porque se lo asignaron o porque lo sigue.
 *
 * Una vez por petición (`cache`): la piden el marco y la vista. El último
 * criterio cuesta una consulta que para en la primera fila.
 */
export interface ModeAccess {
  coraje: boolean;
  redirigir: boolean;
  administrarAccesos: boolean;
}

export const getModeAccess = cache(async (idPersonal: string): Promise<ModeAccess> => {
  const [grants, redirigir] = await Promise.all([
    resolveGrants(idPersonal, [TICKET_ACTIONS.consultar, PORTAL_ACTIONS.administrarAccesos]),
    canRedirect(idPersonal),
  ]);
  const administrarAccesos = grants.has(PORTAL_ACTIONS.administrarAccesos);
  if (redirigir || administrarAccesos) return { coraje: true, redirigir, administrarAccesos };

  const consultar = grants.get(TICKET_ACTIONS.consultar);
  if (!consultar) return { coraje: false, redirigir, administrarAccesos };
  const scope = consultScopeConditions(consultar.alcance, consultar.actor);
  const clientTicket = await prisma.factTicket.findFirst({
    where: { AND: [scope === null ? {} : { OR: scope }, modeCondition("coraje")] },
    select: { idTicket: true },
  });
  return { coraje: clientTicket !== null, redirigir, administrarAccesos };
});

/**
 * El número del interruptor: lo que espera a la persona en un modo, para que
 * cambiar de modo no esconda trabajo. Lo que tiene asignado y abierto (su
 * «Por atender») y, en Coraje, lo que espera área si ella puede redirigirlo.
 */
export async function countModePending(idPersonal: string, mode: TicketMode): Promise<number> {
  const [assigned, unredirected] = await Promise.all([
    prisma.factTicket.count({
      where: { idAsignado: idPersonal, dimEstado: { nombreEstado: { in: [...OPEN_STATES] } }, ...modeCondition(mode) },
    }),
    mode === "coraje" ? countUnredirected(idPersonal) : Promise.resolve(null),
  ]);
  return assigned + (unredirected ?? 0);
}

import { notice } from "@/design-system/recipes/surface";
import type { EmployeeSessionContext } from "@/server/auth/employee-session";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { MAX_OBSERVERS_PER_ACTION } from "@/server/tickets/follow-rules";
import { getCreationCatalog, listFollowCandidates } from "@/server/tickets/ticket-queries";

import { CreateTicketForm } from "./CreateTicketForm";

/**
 * Contenido de «Nuevo ticket», el mismo en la página completa y en la ventana
 * emergente. Consulta el mismo permiso que `createInternalTicket` exige, para
 * no ofrecer un formulario que la acción va a rechazar. La acción lo vuelve a
 * comprobar: esta vista no es la barrera.
 */
export async function NewTicketContent({ employee }: { employee: EmployeeSessionContext }) {
  const grant = await resolveGrant(employee.idPersonal, TICKET_ACTIONS.crear);
  if (!grant) return <p className={notice("warning")}>No tienes permiso para crear tickets.</p>;

  const [catalog, followCandidates] = await Promise.all([
    getCreationCatalog(),
    // Quien radica ya ve su ticket: no se ofrece a sí mismo.
    listFollowCandidates({ excludeIdPersonal: [employee.idPersonal] }),
  ]);
  return <CreateTicketForm catalog={catalog} followCandidates={followCandidates} maxObservers={MAX_OBSERVERS_PER_ACTION} />;
}

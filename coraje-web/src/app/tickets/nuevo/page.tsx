import { notice } from "@/design-system/recipes/surface";
import { CreateTicketForm } from "@/features/tickets/CreateTicketForm";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { getCreationCatalog } from "@/server/tickets/ticket-queries";

/**
 * Radicar un ticket propio (T2). La vista consulta el mismo permiso que
 * `createInternalTicket` exige, para no ofrecer un formulario que la acción
 * va a rechazar. La acción lo vuelve a comprobar: esta vista no es la barrera.
 */
export default async function NewTicketPage() {
  const employee = await requireCurrentEmployee("/tickets/nuevo");
  const grant = await resolveGrant(employee.idPersonal, TICKET_ACTIONS.crear);

  return (
    <AppFrame employee={employee} title="Nuevo ticket">
      <div className="max-w-2xl">
        {grant ? (
          <CreateTicketForm catalog={await getCreationCatalog()} />
        ) : (
          <p className={notice("warning")}>No tienes permiso para crear tickets.</p>
        )}
      </div>
    </AppFrame>
  );
}

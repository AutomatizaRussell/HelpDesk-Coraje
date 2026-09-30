import { NewTicketContent } from "@/features/tickets/NewTicketContent";
import { NewTicketDialog } from "@/features/tickets/NewTicketDialog";
import { requireCurrentEmployee } from "@/server/auth/current-employee";

/**
 * `/tickets/nuevo` interceptada desde la bandeja: el mismo formulario en una
 * ventana emergente encima de la lista. Responde en la misma URL que la
 * página completa, así que resuelve identidad igual que ella (el perímetro la
 * clasifica como `/tickets/nuevo`, `perimeter.test.mts`).
 */
export default async function NewTicketModal() {
  const employee = await requireCurrentEmployee("/tickets/nuevo");

  return (
    <NewTicketDialog>
      <NewTicketContent employee={employee} />
    </NewTicketDialog>
  );
}

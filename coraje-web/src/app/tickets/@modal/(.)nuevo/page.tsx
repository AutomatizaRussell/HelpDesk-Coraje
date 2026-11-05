import { NewTicketContent } from "@/features/tickets/NewTicketContent";
import { NewTicketDialog } from "@/features/tickets/NewTicketDialog";
import { requireCurrentEmployee } from "@/server/auth/current-employee";

/**
 * `/tickets/nuevo` interceptada desde la bandeja: el formulario en una
 * ventana emergente encima de la lista, y la única forma de radicar (la ruta
 * real redirige a la bandeja). Exige sesión aquí porque el perímetro la
 * clasifica como `/tickets/nuevo` (`perimeter.test.mts`) y es esta vista, no
 * la bandeja, la que lee el catálogo.
 */
export default async function NewTicketModal() {
  const employee = await requireCurrentEmployee("/tickets/nuevo");

  return (
    <NewTicketDialog>
      <NewTicketContent employee={employee} />
    </NewTicketDialog>
  );
}

import { AppFrame } from "@/features/shell/AppFrame";
import { NewTicketContent } from "@/features/tickets/NewTicketContent";
import { requireCurrentEmployee } from "@/server/auth/current-employee";

/**
 * Radicar un ticket propio (T2), como página completa: es lo que se ve al
 * abrir o recargar `/tickets/nuevo` directamente. Desde la bandeja, la misma
 * URL se abre como ventana emergente (`app/tickets/@modal/(.)nuevo`).
 */
export default async function NewTicketPage() {
  const employee = await requireCurrentEmployee("/tickets/nuevo");

  return (
    <AppFrame employee={employee} title="Nuevo ticket">
      <div className="mx-auto w-full max-w-form">
        <NewTicketContent employee={employee} />
      </div>
    </AppFrame>
  );
}

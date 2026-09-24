import { redirect } from "next/navigation";

import { AppFrame } from "@/features/shell/AppFrame";
import { getCurrentEmployee } from "@/server/auth/current-employee";

/**
 * Entrada raíz de HelpDesk para empleados (specs/acceso-empleados.md §4).
 *
 * Sin sesión: pasa por `/ingreso`, que decide si la persona viene con sesión
 * de Conecta —entra sin clics— o directo —elige cuenta en `/login`—
 * (specs/integracion-conecta.md §2). Con sesión: entra al marco que
 * corresponda a su modo de entrada.
 *
 * Primera vista construida sobre el contrato de diseño (U5): no contiene un
 * solo valor visual propio. La bandeja es trabajo de U7; mientras no exista,
 * la vista dice dónde se gestionan hoy los tickets en vez de dejar una
 * pantalla vacía.
 */
export default async function HomePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect("/ingreso?destino=%2F");
  }

  return (
    <AppFrame employee={employee} title="Inicio">
      <section className="max-w-2xl rounded-surface border border-line bg-surface p-6">
        <h2 className="text-md font-bold text-heading">Bandeja de tickets</h2>
        <p className="mt-2 text-ink-muted">
          La bandeja todavía no está disponible en HelpDesk. Los tickets se siguen gestionando en la
          aplicación de PowerApps.
        </p>
      </section>
    </AppFrame>
  );
}

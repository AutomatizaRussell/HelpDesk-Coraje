import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/server/auth/current-employee";

/**
 * Entrada raíz de HelpDesk para empleados (specs/acceso-empleados.md §4).
 *
 * Sin sesión: pasa por `/ingreso`, que decide si la persona viene con sesión
 * de Conecta —entra sin clics— o directo —elige cuenta en `/login`—
 * (specs/integracion-conecta.md §2). Con sesión: la bandeja es la pantalla de
 * trabajo, y la raíz lleva a ella.
 */
export default async function HomePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect("/ingreso?destino=%2Ftickets");
  }

  redirect("/tickets");
}

import { redirect } from "next/navigation";

import { ConectaShell } from "@/design-system/patterns/conecta-shell/ConectaShell";
import { getCurrentEmployee } from "@/server/auth/current-employee";
import { signOutAction } from "@/server/auth/sign-out-action";

/**
 * Entrada raíz de HelpDesk para empleados (specs/acceso-empleados.md §4).
 *
 * Sin sesión: dispara el intento silencioso de inmediato (`prompt=none`) —
 * el caso ordinario es "ningún clic" cuando el navegador ya trae una sesión
 * viva de Microsoft Entra ID por cualquier otro medio (Conecta, Outlook,
 * Teams). Con sesión: entra al shell.
 *
 * Primera vista construida sobre el contrato de diseño (U5): no contiene un
 * solo valor visual propio, solo clases del vocabulario de `globals.css`. La
 * bandeja es trabajo de U7; mientras no exista, la vista dice dónde se
 * gestionan hoy los tickets en vez de dejar una pantalla vacía.
 */
export default async function HomePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect("/api/auth/microsoft/start?destino=%2F");
  }

  return (
    <ConectaShell title="Inicio" employeeName={employee.nombreCompleto} signOutAction={signOutAction}>
      <section className="max-w-2xl rounded-surface border border-line bg-surface p-6">
        <h2 className="text-md font-bold text-heading">Bandeja de tickets</h2>
        <p className="mt-2 text-ink-muted">
          La bandeja todavía no está disponible en HelpDesk. Los tickets se siguen gestionando en la
          aplicación de PowerApps.
        </p>
      </section>
    </ConectaShell>
  );
}

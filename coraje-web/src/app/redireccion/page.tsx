import Link from "next/link";

import { AppShell } from "@/components/app/AppShell";
import { PendingRedirectTicketsTable } from "@/features/redireccion/components/PendingRedirectTicketsTable";
import { getPendingRedirectTickets } from "@/features/redireccion/data/getPendingRedirectTickets";
import { requireCurrentEmployee } from "@/server/auth/current-employee";

export const dynamic = "force-dynamic";

/**
 * Vista interna de tickets pendientes de redirección.
 *
 * Solo muestra tickets creados desde el portal de clientes que todavía no
 * tienen área destino. Esta vista no reemplaza PowerApps; solo prepara el
 * envío posterior hacia SharePoint/HelpDeskBd.
 */
export default async function RedireccionPage() {
  // Identidad de empleado, no clave compartida: esta vista pasó de estar
  // detrás de una contraseña de entorno —que todo el equipo conocía y que no
  // dejaba rastro de quién había entrado— a exigir la sesión emitida por el
  // flujo OIDC de specs/acceso-empleados.md. El destino se pasa para que,
  // tras el ingreso, la persona vuelva aquí y no a la raíz.
  await requireCurrentEmployee("/redireccion");

  const tickets = await getPendingRedirectTickets();

  return (
    <AppShell>
      <section className="space-y-8">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#718096]">
              Acceso interno
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#001871]">
              Tickets pendientes de redirección
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#718096]">
              Clasifica los requerimientos creados por clientes y define el área,
              tipo y categoría antes de enviarlos al flujo legacy.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-3 text-sm font-bold text-[#001871] shadow-[var(--card-shadow)] transition hover:bg-[#f8fafc]"
            >
              Volver al inicio
            </Link>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <article className="rounded-[20px] border-l-[6px] border-[#ed8b00] bg-white p-7 shadow-[var(--card-shadow)]">
            <p className="text-sm font-bold uppercase tracking-wider text-[#718096]">
              Pendientes
            </p>

            <p className="mt-3 bg-gradient-to-r from-[#cc7700] to-[#ed8b00] bg-clip-text text-5xl font-black text-transparent">
              {tickets.length}
            </p>

            <p className="mt-2 text-sm font-semibold text-zinc-400">
              Tickets sin área destino
            </p>
          </article>
        </div>

        <PendingRedirectTicketsTable tickets={tickets} />
      </section>
    </AppShell>
  );
}

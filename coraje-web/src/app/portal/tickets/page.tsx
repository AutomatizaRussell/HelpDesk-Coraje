import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { clearSelectedClientAction } from "@/app/portal/actions";
import { PortalTicketsTable } from "@/features/portal/components/PortalTicketsTable";
import { getPortalTickets } from "@/features/portal/data/getPortalTickets";
import { getSelectedClient } from "@/features/portal/data/getSelectedClient";
import { deletePortalTicketAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Vista de tickets del cliente seleccionado.
 *
 * Alcance actual:
 * - Usa login falso basado en cookie.
 * - Si no hay cliente seleccionado, redirige a /portal.
 * - Muestra únicamente tickets asociados al id_cliente_contai seleccionado.
 * - Permite navegar a la creación de un nuevo ticket.
 * - Permite cerrar la sesión temporal eliminando la cookie.
 *
 * Esta vista NO es la vista interna de redirección.
 */
export default async function PortalTicketsPage() {
  const client = await getSelectedClient();

  if (!client) {
    redirect("/portal");
  }

  const tickets = await getPortalTickets(client.idClienteContai);

  return (
    <AppShell>
      <section className="space-y-8">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#718096]">
              Portal de clientes
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#001871]">
              Tickets de {client.nombreCliente}
            </h1>

            <p className="mt-2 text-sm font-medium text-[#718096]">
              NIT / ID: {client.identificacionFiscal ?? "Sin dato"}
            </p>

            <p className="mt-1 text-sm font-medium text-[#718096]">
              Tipo: {client.tipoCliente ?? "Sin tipo"} · Grupo:{" "}
              {client.grupoEconomico ?? "Sin grupo"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/portal/tickets/nuevo"
              className="rounded-xl bg-gradient-to-r from-[#ed8b00] to-[#d17a00] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Crear nuevo ticket
            </Link>

            <form action={clearSelectedClientAction}>
              <button
                type="submit"
                className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-3 text-sm font-bold text-[#001871] shadow-[var(--card-shadow)] transition hover:bg-[#f8fafc]"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <PortalTicketsTable
          tickets={tickets}
          deleteAction={deletePortalTicketAction}
        />

      </section>
    </AppShell>
  );
}
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { getSelectedClient } from "@/features/portal/data/getSelectedClient";
import { getPortalTicketDatePreview } from "@/features/portal/data/getPortalTicketDatePreview";
import { createPortalTicketAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Página de creación de ticket para cliente.
 *
 * Alcance actual:
 * - Login falso mediante cliente seleccionado en cookie.
 * - El cliente solo diligencia el requerimiento.
 * - El sistema calcula automáticamente:
 *   - fecha de creación;
 *   - fecha límite;
 *   - estado inicial ABIERTO;
 *   - prioridad MEDIA;
 *   - origen_sistema PORTAL_CLIENTE.
 *
 * No se solicita al cliente:
 * - prioridad;
 * - área;
 * - tipo de requerimiento;
 * - categoría;
 * - fecha manual;
 * - datos adicionales no requeridos por fact_ticket.
 */

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
export default async function NewPortalTicketPage() {
  const client = await getSelectedClient();

  if (!client) {
    redirect("/portal");
  }

  const datePreview = await getPortalTicketDatePreview();

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#718096]">
            Portal de clientes
          </p>

          <h1 className="text-3xl font-black tracking-tight text-[#001871]">
            Crear nuevo ticket
          </h1>

          <p className="text-sm font-medium text-[#718096]">
            Cliente seleccionado:{" "}
            <span className="font-black text-[#001871]">
              {client.nombreCliente}
            </span>
          </p>
        </header>

        <div className="rounded-[20px] border border-[#e2e8f0] bg-white p-6 shadow-[var(--card-shadow)]">
          <div className="mb-6 rounded-2xl bg-[#f8fafc] p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
              Datos del cliente
            </p>

            <p className="mt-2 font-black text-[#001871]">
              {client.nombreCliente}
            </p>

            <p className="mt-1 text-sm font-medium text-[#718096]">
              NIT / ID: {client.identificacionFiscal ?? "Sin dato"}
            </p>

            <p className="mt-1 text-sm font-medium text-[#718096]">
              Tipo: {client.tipoCliente ?? "Sin tipo"} · Grupo:{" "}
              {client.grupoEconomico ?? "Sin grupo"}
            </p>
          </div>

          <form action={createPortalTicketAction} className="space-y-6">
            <div>
              <label
                htmlFor="descripcion"
                className="text-xs font-bold uppercase tracking-wide text-[#001871]"
              >
                Requerimiento
              </label>

              <textarea
                id="descripcion"
                name="descripcion"
                required
                minLength={10}
                rows={8}
                placeholder="Describe el requerimiento que deseas registrar..."
                className="mt-2 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm font-medium outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
                  Fecha de creación
                </p>

                <p className="mt-2 text-2xl font-black text-[#001871]">
                  {formatDate(datePreview.fechaCreacion)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
                  Fecha límite estimada
                </p>

                <p className="mt-2 text-2xl font-black text-[#ed8b00]">
                  {formatDate(datePreview.fechaLimite)}
                </p>

                <p className="mt-1 text-xs font-semibold text-[#718096]">
                  {datePreview.diasSla} días hábiles
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">


              <Link
                href="/portal/tickets"
                className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-3 text-sm font-bold text-[#001871] transition hover:bg-[#f8fafc]"
              >
                Cancelar
              </Link>


              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-[#ed8b00] to-[#d17a00] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                Crear ticket
              </button>
            </div>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
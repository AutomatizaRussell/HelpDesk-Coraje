import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { RedirectTicketForm } from "@/features/redireccion/components/RedirectTicketForm";
import { getRedirectCatalog } from "@/features/redireccion/data/getRedirectCatalog";
import { getRedirectTicket } from "@/features/redireccion/data/getRedirectTicket";
import { requireRedireccionAuth } from "@/features/redireccion/data/redireccionAuth";

import { redirectTicketAction } from "./actions";

export const dynamic = "force-dynamic";

type RedirectTicketPageProps = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Formatea fechas para la vista interna.
 */
function formatDate(date: Date | null): string {
  if (!date) {
    return "Sin fecha";
  }

  return date.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Vista de detalle para redirigir un ticket.
 *
 * El empleado no resuelve el ticket. Solo selecciona área, tipo y categoría
 * para enviarlo posteriormente a SharePoint/PowerApps mediante outbox.
 */
export default async function RedirectTicketPage({
  params,
}: RedirectTicketPageProps) {
  await requireRedireccionAuth();

  const { id } = await params;

  const [ticket, catalog] = await Promise.all([
    getRedirectTicket(id),
    getRedirectCatalog(),
  ]);

  if (!ticket) {
    notFound();
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#718096]">
              Redirección interna
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#001871]">
              Redirigir ticket {ticket.codigoTicket ?? "(pendiente de código)"}
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#718096]">
              Define el área, tipo y categoría del requerimiento. Al guardar, el
              ticket quedará listo en la cola de sincronización hacia
              SharePoint.
            </p>
          </div>

          <Link
            href="/redireccion"
            className="rounded-xl border border-[#e2e8f0] bg-white px-5 py-3 text-sm font-bold text-[#001871] shadow-[var(--card-shadow)] transition hover:bg-[#f8fafc]"
          >
            Volver
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-[20px] border border-[#e2e8f0] bg-white p-6 shadow-[var(--card-shadow)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
              Requerimiento
            </p>

            <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-zinc-800">
              {ticket.descripcionProblema}
            </p>
          </section>

          <aside className="space-y-4 rounded-[20px] border border-[#e2e8f0] bg-white p-6 shadow-[var(--card-shadow)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
                Cliente
              </p>

              <p className="mt-2 font-black text-[#001871]">
                {ticket.dimClienteContai?.nombreCliente ?? "Sin cliente"}
              </p>

              <p className="mt-1 text-sm font-medium text-[#718096]">
                NIT / ID:{" "}
                {ticket.dimClienteContai?.identificacionFiscal ??
                  "Sin dato"}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl bg-[#f8fafc] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
                  Creación
                </p>
                <p className="mt-1 font-black text-[#001871]">
                  {formatDate(ticket.fechaCreacion)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#f8fafc] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
                  Fecha límite
                </p>
                <p className="mt-1 font-black text-[#ed8b00]">
                  {formatDate(ticket.fechaLimite)}
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="rounded-[20px] border border-[#e2e8f0] bg-white p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-xl font-black text-[#001871]">
            Clasificación y redirección
          </h2>

          <p className="mt-2 text-sm font-medium text-[#718096]">
            Selecciona la combinación correcta. Categoría 2 solo aplica cuando
            el catálogo la tenga configurada.
          </p>

          <div className="mt-6">
            <RedirectTicketForm
              ticketId={ticket.idTicket}
              areas={catalog.areas}
              tiposRequerimiento={catalog.tiposRequerimiento}
              action={redirectTicketAction}
            />
          </div>
        </section>
      </section>
    </AppShell>
  );
}
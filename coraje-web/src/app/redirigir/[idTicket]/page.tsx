import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { focusRing } from "@/design-system/recipes/interaction";
import { sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { RedirectForm } from "@/features/redireccion/RedirectForm";
import { formatDateTime } from "@/features/tickets/format";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { getTicketToRedirect } from "@/server/tickets/redirect-queries";
import { inboxPath } from "@/server/tickets/ticket-mode";
import { getCreationCatalog } from "@/server/tickets/ticket-queries";

/**
 * Redirigir al área un ticket del portal (T3). Si ya se redirigió, no existe
 * o la persona no puede redirigir, responde 404: las tres respuestas son
 * iguales. Siempre en modo Coraje (U17): es trabajo con clientes.
 */
export default async function RedirectTicketPage({ params }: { params: Promise<{ idTicket: string }> }) {
  const { idTicket } = await params;
  const employee = await requireCurrentEmployee(`/redirigir/${idTicket}`);
  if (!z.uuid().safeParse(idTicket).success) notFound();

  const [ticket, catalog] = await Promise.all([
    getTicketToRedirect({ idPersonal: employee.idPersonal, idTicket }),
    getCreationCatalog(),
  ]);
  if (!ticket) notFound();

  return (
    <AppFrame employee={employee} title={`Redirigir · ${ticket.cliente}`} mode="coraje">
      <div className="space-y-4">
        <Link
          href={inboxPath("coraje", "redirigir")}
          className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Volver a la bandeja
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className={surface()} aria-labelledby="descripcion-titulo">
              <h2 id="descripcion-titulo" className={sectionTitle}>Lo que escribió el cliente</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-base text-ink">{ticket.descripcion}</p>
            </section>
            <section className={surface()} aria-labelledby="redirigir-titulo">
              <h2 id="redirigir-titulo" className={cn(sectionTitle, "mb-4")}>Área que lo atiende</h2>
              <RedirectForm idTicket={ticket.idTicket} catalog={catalog} backHref={inboxPath("coraje", "redirigir")} />
            </section>
          </div>

          <aside className={cn(surface(), "h-fit")} aria-label="Datos del cliente">
            <dl className="divide-y divide-line">
              <div className="py-2.5">
                <dt className="text-sm text-ink-muted">Cliente</dt>
                <dd className="mt-0.5 text-base text-ink">{ticket.cliente}</dd>
              </div>
              {ticket.identificacionFiscal && (
                <div className="py-2.5">
                  <dt className="text-sm text-ink-muted">Identificación fiscal</dt>
                  <dd className="mt-0.5 text-base tabular-nums text-ink">{ticket.identificacionFiscal}</dd>
                </div>
              )}
              <div className="py-2.5">
                <dt className="text-sm text-ink-muted">Contacto</dt>
                <dd className="mt-0.5 text-base text-ink">{ticket.contacto}</dd>
              </div>
              <div className="py-2.5">
                <dt className="text-sm text-ink-muted">Radicado</dt>
                <dd className="mt-0.5 text-base text-ink">{formatDateTime(ticket.fechaCreacion)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}

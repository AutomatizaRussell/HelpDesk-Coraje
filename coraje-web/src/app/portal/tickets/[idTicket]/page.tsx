import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { PortalShell } from "@/design-system/patterns/portal-shell/PortalShell";
import { TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { signOutPortalAction } from "@/features/portal/actions";
import { formatDate, formatDateTime } from "@/features/tickets/format";
import { requirePortalAccess } from "@/server/portal/portal-access";
import { getContactTicket } from "@/server/portal/portal-tickets";

/**
 * Una solicitud vista por quien la radicó. Un id ajeno y uno inexistente
 * responden igual, con 404: la vista no le dice a nadie qué tickets existen
 * (acceso-clientes.md §10).
 *
 * La historia llega filtrada desde la consulta (`CLIENTE` y `AMBOS`): las
 * notas internas y la clasificación no están en la memoria de esta petición.
 */
const EVENT_TITLE: Record<string, string> = {
  CREACION: "Solicitud radicada",
  RESPUESTA: "Respuesta",
  RECHAZO: "No se atenderá",
};

export default async function PortalTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ idTicket: string }>;
  searchParams: Promise<{ radicado?: string }>;
}) {
  const access = await requirePortalAccess();
  const { idTicket } = await params;
  if (!z.uuid().safeParse(idTicket).success) notFound();
  const ticket = await getContactTicket(access, idTicket);
  if (!ticket) notFound();
  const { radicado } = await searchParams;

  return (
    <PortalShell
      title={ticket.codigoTicket ?? `Solicitud del ${formatDate(ticket.fechaCreacion)}`}
      contactName={access.nombreContacto}
      clientName={access.nombreCliente}
      signOutAction={signOutPortalAction}
    >
      <div className="space-y-4">
        <Link
          href="/portal"
          className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Volver a mis solicitudes
        </Link>

        {radicado === "1" && (
          <p className={notice("success")} role="status">
            Recibimos tu solicitud. El equipo la asignará al área que corresponde y te responderá por correo.
          </p>
        )}

        <section className={surface()} aria-labelledby="estado-titulo">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="estado-titulo" className={sectionTitle}>Estado</h2>
            <TicketStateBadge state={ticket.estado} />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Radicada el {formatDateTime(ticket.fechaCreacion)}
            {ticket.fechaResolucion && ` · terminada el ${formatDateTime(ticket.fechaResolucion)}`}
          </p>
        </section>

        <section className={surface()} aria-labelledby="historia-titulo">
          <h2 id="historia-titulo" className={cn(sectionTitle, "mb-4")}>Historia</h2>
          <ol className="space-y-3">
            {ticket.history.map((entry) => (
              <li key={entry.idEvento} className="rounded-control border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-sm">
                    <span className="font-bold text-heading">{EVENT_TITLE[entry.tipo] ?? "Actualización"}</span>
                    <span className="text-ink-muted"> · {entry.autor}</span>
                  </p>
                  <time dateTime={entry.fecha.toISOString()} className="text-sm tabular-nums text-ink-muted">
                    {formatDateTime(entry.fecha)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-base text-ink">{entry.contenido}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PortalShell>
  );
}

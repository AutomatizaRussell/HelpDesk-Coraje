import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { MailStateBadge, SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { formatDate, formatDateTime, formatPriority } from "@/features/tickets/format";
import {
  InternalNoteForm,
  ReassignForm,
  RejectForm,
  ResendMailForm,
  RespondForm,
} from "@/features/tickets/TicketActionForms";
import { TicketHistory } from "@/features/tickets/TicketHistory";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { listTicketMail } from "@/server/notifications/ticket-notifications";
import { getTicketDetail, listReassignCandidates } from "@/server/tickets/ticket-queries";

/**
 * Detalle de un ticket: ficha, historia y las acciones que la persona puede
 * ejecutar. Un ticket inexistente y uno fuera de alcance responden igual, con
 * 404: la vista no le dice a nadie qué tickets existen.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-base text-ink">{children}</dd>
    </div>
  );
}

function ActionPanel({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  // <details> nativo: se abre con teclado y lector de pantalla sin código.
  return (
    <details className="group border-t border-line py-4 first:border-t-0 first:pt-0" open={open}>
      <summary className={cn("cursor-pointer rounded-control font-bold text-heading", focusRing)}>{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ idTicket: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { idTicket } = await params;
  const employee = await requireCurrentEmployee(`/tickets/${idTicket}`);
  if (!z.uuid().safeParse(idTicket).success) notFound();

  const ticket = await getTicketDetail({ idPersonal: employee.idPersonal, idTicket });
  if (!ticket) notFound();

  const { creado } = await searchParams;
  const { capabilities } = ticket;
  // El responsable actual no es destino de su propia reasignación.
  const reassignCandidates = capabilities.reasignar
    ? await listReassignCandidates({ idPersonal: employee.idPersonal, excludeIdPersonal: ticket.idAsignado })
    : [];
  const mails = await listTicketMail({
    idTicket: ticket.idTicket,
    idPersonal: employee.idPersonal,
    teamView: ticket.projection === "EQUIPO",
  });
  const hasActions = capabilities.responder || capabilities.reasignar || capabilities.rechazar || capabilities.notaInterna;

  return (
    <AppFrame employee={employee} title={ticket.codigoTicket ?? "Ticket sin código"}>
      <div className="space-y-4">
        <Link
          href="/tickets"
          className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Volver a la bandeja
        </Link>

        {creado === "1" && (
          <p className={notice("success")} role="status">
            Ticket creado y asignado a {ticket.responsable ?? "la persona responsable del área"}.
          </p>
        )}
        {!ticket.operable && (
          <p className={notice("info")}>Este ticket viene de PowerApps. Aquí solo se consulta; se sigue gestionando en PowerApps.</p>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className={surface()} aria-labelledby="descripcion-titulo">
              <h2 id="descripcion-titulo" className={sectionTitle}>Descripción</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-base text-ink">{ticket.descripcion}</p>
            </section>

            {hasActions && (
              <section className={surface()} aria-labelledby="acciones-titulo">
                <h2 id="acciones-titulo" className={cn(sectionTitle, "mb-4")}>Acciones</h2>
                {capabilities.responder && (
                  <ActionPanel title="Responder" open>
                    <RespondForm idTicket={ticket.idTicket} />
                  </ActionPanel>
                )}
                {capabilities.reasignar && (
                  <ActionPanel title="Reasignar dentro del área">
                    <ReassignForm idTicket={ticket.idTicket} candidates={reassignCandidates} />
                  </ActionPanel>
                )}
                {capabilities.notaInterna && (
                  <ActionPanel title="Agregar nota interna">
                    <InternalNoteForm idTicket={ticket.idTicket} />
                  </ActionPanel>
                )}
                {capabilities.rechazar && (
                  <ActionPanel title="Rechazar">
                    <RejectForm idTicket={ticket.idTicket} />
                  </ActionPanel>
                )}
              </section>
            )}

            <section className={surface()} aria-labelledby="historia-titulo">
              <h2 id="historia-titulo" className={cn(sectionTitle, "mb-4")}>Historia</h2>
              <TicketHistory entries={ticket.history} />
            </section>

            {mails.length > 0 && (
              <section className={surface()} aria-labelledby="correos-titulo">
                <h2 id="correos-titulo" className={cn(sectionTitle, "mb-2")}>Correos</h2>
                <ul className="divide-y divide-line">
                  {mails.map((mail) => (
                    <li key={mail.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-base text-ink">
                          Para {mail.destinatario} · <span className="text-ink-muted">{mail.asunto}</span>
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-ink-muted">{formatDateTime(mail.fecha)}</p>
                        {mail.estado === "FALLIDO" && mail.error && <p className="mt-1 text-sm text-danger">{mail.error}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <MailStateBadge state={mail.estado} />
                        {mail.puedeReenviar && <ResendMailForm idNotificacion={mail.id} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className={cn(surface(), "h-fit")} aria-label="Datos del ticket">
            <div className="flex flex-wrap items-center gap-2">
              <TicketStateBadge state={ticket.estado} />
              {ticket.sla && <SlaBadge status={ticket.sla} />}
            </div>
            <dl className="mt-3 divide-y divide-line">
              <Field label="Vence">{ticket.fechaLimite ? formatDate(ticket.fechaLimite) : "Sin fecha límite"}</Field>
              <Field label="Prioridad">{ticket.prioridad ? formatPriority(ticket.prioridad) : "Sin prioridad"}</Field>
              <Field label="Área">{ticket.area ?? "Sin área"}</Field>
              <Field label="Tipo">
                {ticket.tipo ?? "Sin tipo"}
                {ticket.categoria1 && <span className="block text-sm text-ink-muted">{[ticket.categoria1, ticket.categoria2].filter(Boolean).join(" · ")}</span>}
              </Field>
              <Field label="Solicitante">{ticket.solicitante ?? "Sin solicitante"}</Field>
              <Field label="Responsable">{ticket.responsable ?? "Sin responsable"}</Field>
              <Field label="Radicado">{formatDateTime(ticket.fechaCreacion)}</Field>
              {ticket.fechaResolucion && <Field label="Terminado">{formatDateTime(ticket.fechaResolucion)}</Field>}
            </dl>
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { MailStateBadge, SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { formatCatalogLabel, formatDate, formatDateTime, formatPriority } from "@/features/tickets/format";
import { TabbedPanel, type TabbedPanelItem } from "@/design-system/patterns/tabbed-panel/TabbedPanel";
import {
  AddObserversForm,
  InternalNoteForm,
  ReassignForm,
  RemoveObserverForm,
  RequestValidationForm,
  RequesterCommentForm,
  ResendMailForm,
  RespondForm,
} from "@/features/tickets/TicketActionForms";
import { EditableField, RejectAction } from "@/features/tickets/TicketDetailActions";
import { TicketHistory } from "@/features/tickets/TicketHistory";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { listTicketMail } from "@/server/notifications/ticket-notifications";
import { logEvent } from "@/server/observability/log";
import { getMirrorStatus, type MirrorStatus } from "@/server/sync/sharepoint-mirror";
import { MAX_OBSERVERS_PER_ACTION } from "@/server/tickets/follow-rules";
import { getTicketDetail, listFollowCandidates, listReassignCandidates } from "@/server/tickets/ticket-queries";

/**
 * Detalle de un ticket: descripción, cuadro para escribir e historia a la
 * izquierda; datos a la derecha, cada uno con su acción al lado (opción B,
 * 30-sep-2026). Un ticket
 * inexistente y uno fuera de alcance responden igual, con 404: la vista no le
 * dice a nadie qué tickets existen.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-base text-ink">{children}</dd>
    </div>
  );
}


/** Quienes siguen el ticket, con la × para retirarlos si se puede. */
function ObserverList({
  observadores,
  idTicket,
  canRemove,
}: {
  observadores: { idPersonal: string; nombre: string }[];
  idTicket: string;
  canRemove: boolean;
}) {
  if (observadores.length === 0) return <span className="text-ink-muted">Nadie sigue este ticket</span>;
  return (
    <ul className="space-y-1">
      {observadores.map((observador) => (
        <li key={observador.idPersonal} className="flex items-center justify-between gap-2">
          <span>{observador.nombre}</span>
          {canRemove && <RemoveObserverForm idTicket={idTicket} idObservador={observador.idPersonal} nombre={observador.nombre} />}
        </li>
      ))}
    </ul>
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
  // Seguimiento (U11). Una sola lectura del directorio para los dos
  // selectores; cada uno quita a quien no tiene sentido ofrecer.
  const followCandidates =
    capabilities.gestionarObservadores || capabilities.solicitarValidacion
      ? await listFollowCandidates({ excludeIdPersonal: [] })
      : [];
  const yaLoVen = new Set([ticket.idSolicitante, ticket.idAsignado, ...ticket.observadores.map((item) => item.idPersonal)]);
  const observerCandidates = followCandidates.filter((person) => !yaLoVen.has(person.idPersonal));
  const validationCandidates = followCandidates.filter((person) => person.idPersonal !== employee.idPersonal);

  // Opción B, ajustada el 30-sep-2026: todo lo que se escribe va en un cuadro
  // debajo de la descripción, sobre la historia (que llega con lo más
  // reciente primero); cambiar responsable u observadores, junto a esos datos;
  // rechazar, junto al estado. Solo aparece lo que el estado y el alcance
  // permiten (`capabilities`), con las mismas reglas del servicio.
  const composerTabs: TabbedPanelItem[] = [
    ...(capabilities.responder
      ? [{ id: "responder", label: "Responder al solicitante", content: <RespondForm idTicket={ticket.idTicket} /> }]
      : []),
    // Quien es a la vez responsable y solicitante responde o anota: dos
    // formas de escribirle al mismo ticket confunden.
    ...(capabilities.comentarSolicitante && !capabilities.responder
      ? [{ id: "comentar", label: "Escribir en el ticket", content: <RequesterCommentForm idTicket={ticket.idTicket} /> }]
      : []),
    ...(capabilities.notaInterna
      ? [{ id: "nota", label: "Nota interna", content: <InternalNoteForm idTicket={ticket.idTicket} /> }]
      : []),
    // Pedir validación es escribirle algo a una persona concreta: va con lo
    // que se escribe, no con los datos.
    ...(capabilities.solicitarValidacion
      ? [
          {
            id: "validacion",
            label: "Pedir validación",
            content: <RequestValidationForm idTicket={ticket.idTicket} candidates={validationCandidates} />,
          },
        ]
      : []),
  ];
  // El espejo en PowerApps solo existe para los tickets de HelpDesk, y es
  // información del equipo. Es un panel de apoyo: si su lectura falla, el
  // ticket se sigue mostrando y el fallo queda en el registro del servidor.
  let mirror: MirrorStatus | null = null;
  if (ticket.operable && ticket.projection === "EQUIPO") {
    try {
      mirror = await getMirrorStatus(ticket.idTicket);
    } catch (error) {
      logEvent("error", "espejo.estado_no_leido", { idTicket: ticket.idTicket }, error);
    }
  }

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

            {composerTabs.length > 0 && (
              <section className={surface()} aria-label="Escribir en el ticket">
                <TabbedPanel label="Escribir en el ticket" items={composerTabs} />
              </section>
            )}

            <section className={surface()} aria-labelledby="historia-titulo">
              <h2 id="historia-titulo" className={cn(sectionTitle, "mb-4")}>Historia</h2>
              <TicketHistory entries={ticket.history} />
            </section>

            {mirror && (mirror.spId !== null || mirror.divergencias.length > 0 || mirror.activo) && (
              <section className={surface()} aria-labelledby="powerapps-titulo">
                <h2 id="powerapps-titulo" className={cn(sectionTitle, "mb-2")}>PowerApps</h2>
                <p className="text-sm text-ink-muted">
                  {!mirror.activo
                    ? "El espejo en PowerApps está apagado: este ticket no se refleja en la lista HelpDeskBd."
                    : mirror.spId === null
                      ? "Todavía no se refleja en PowerApps."
                      : `Se refleja en PowerApps (ítem ${mirror.spId} de HelpDeskBd).`}
                  {mirror.ultimoEnvio && ` Último envío: ${mirror.ultimoEnvio.estado.toLowerCase()}, ${formatDateTime(mirror.ultimoEnvio.fecha)}.`}
                </p>
                {mirror.ultimoEnvio?.estado === "FAILED" && mirror.ultimoEnvio.error && (
                  <p className="mt-1 text-sm text-danger">{mirror.ultimoEnvio.error}</p>
                )}
                {mirror.divergencias.length > 0 && (
                  <ul className="mt-3 divide-y divide-line">
                    {mirror.divergencias.map((item) => (
                      <li key={item.id} className="py-2.5">
                        <p className="text-base text-ink">
                          Cambio en PowerApps · {item.campo}
                          {item.valorSharepoint && <span className="text-ink-muted"> → {item.valorSharepoint}</span>}
                        </p>
                        <p className={cn("text-sm", item.resultado === "RECHAZADO" ? "text-danger" : "text-ink-muted")}>
                          {item.resultado === "APLICADO" ? "Aplicado en HelpDesk" : `No se aplicó: ${item.motivo ?? "sin motivo"}`} ·{" "}
                          {formatDateTime(item.fecha)}
                          {item.revisadaAt && ` · Revisado el ${formatDateTime(item.revisadaAt)}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TicketStateBadge state={ticket.estado} />
                {ticket.sla && <SlaBadge status={ticket.sla} />}
              </div>
              {/* Junto al estado, que es lo que cambia; lejos de «Responder y cerrar». */}
              {capabilities.rechazar && <RejectAction idTicket={ticket.idTicket} />}
            </div>
            <dl className="mt-3 divide-y divide-line">
              <Field label="Vence">{ticket.fechaLimite ? formatDate(ticket.fechaLimite) : "Sin fecha límite"}</Field>
              <Field label="Prioridad">{ticket.prioridad ? formatPriority(ticket.prioridad) : "Sin prioridad"}</Field>
              <Field label="Área">{ticket.area ?? "Sin área"}</Field>
              <Field label="Tipo">
                {ticket.tipo ? formatCatalogLabel(ticket.tipo) : "Sin tipo"}
                {ticket.categoria1 && (
                  <span className="block text-sm text-ink-muted">
                    {[ticket.categoria1, ticket.categoria2].flatMap((value) => (value ? [formatCatalogLabel(value)] : [])).join(" · ")}
                  </span>
                )}
              </Field>
              <Field label="Solicitante">{ticket.solicitante ?? "Sin solicitante"}</Field>
              {capabilities.reasignar ? (
                <EditableField
                  label="Responsable"
                  actionLabel="Cambiar responsable"
                  icon={Pencil}
                  form={<ReassignForm idTicket={ticket.idTicket} candidates={reassignCandidates} />}
                >
                  {ticket.responsable ?? "Sin responsable"}
                </EditableField>
              ) : (
                <Field label="Responsable">{ticket.responsable ?? "Sin responsable"}</Field>
              )}
              {capabilities.gestionarObservadores ? (
                <EditableField
                  label="Observadores"
                  actionLabel="Añadir observadores"
                  icon={Plus}
                  form={<AddObserversForm idTicket={ticket.idTicket} candidates={observerCandidates} max={MAX_OBSERVERS_PER_ACTION} />}
                >
                  <ObserverList observadores={ticket.observadores} idTicket={ticket.idTicket} canRemove />
                </EditableField>
              ) : (
                <Field label="Observadores">
                  <ObserverList observadores={ticket.observadores} idTicket={ticket.idTicket} canRemove={false} />
                </Field>
              )}
              <Field label="Radicado">{formatDateTime(ticket.fechaCreacion)}</Field>
              {ticket.fechaResolucion && <Field label="Terminado">{formatDateTime(ticket.fechaResolucion)}</Field>}
            </dl>
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}

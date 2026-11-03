import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { AreaName } from "@/design-system/patterns/area/AreaName";
import { FlashToast } from "@/design-system/patterns/toast/Toaster";
import { MailStateBadge, SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { areaThemeKey } from "@/features/areas/area-theme";
import { formatCatalogLabel, formatDate, formatDateTime, formatPriority } from "@/features/tickets/format";
import {
  AddObserversForm,
  ApprovalResponseForm,
  ReassignForm,
  RemoveObserverForm,
  RequestApprovalForm,
  ResendMailForm,
  TicketComposer,
  WithdrawApprovalForm,
} from "@/features/tickets/TicketActionForms";
import { EditableField } from "@/features/tickets/TicketDetailActions";
import { TicketHistory } from "@/features/tickets/TicketHistory";
import { AppFrame } from "@/features/shell/AppFrame";
import { APP_BASE_PATH } from "@/server/auth/base-path";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { markTicketNoticesRead } from "@/server/notifications/ticket-notices";
import { listTicketMail } from "@/server/notifications/ticket-notifications";
import { MAX_OBSERVERS_PER_ACTION } from "@/server/tickets/follow-rules";
import { inboxPath } from "@/server/tickets/ticket-mode";
import { getTicketDetail, listFollowCandidates, listReassignCandidates, type TicketDetail } from "@/server/tickets/ticket-queries";

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


const APPROVAL_RESULT: Record<"APROBADA" | "NO_APROBADA" | "RETIRADA", string> = {
  APROBADA: "aprobó",
  NO_APROBADA: "no aprobó",
  RETIRADA: "solicitud retirada",
};

/**
 * La aprobación del ticket (U29): quién debe aprobar mientras está
 * pendiente, y lo que ya se resolvió. La pendiente es lo primero porque es lo
 * que bloquea el cierre.
 */
function ApprovalSummary({ aprobacion }: { aprobacion: TicketDetail["aprobacion"] }) {
  if (!aprobacion.pendiente && aprobacion.resueltas.length === 0) return <span className="text-ink-muted">Nadie la ha pedido</span>;
  return (
    <ul className="space-y-1">
      {aprobacion.pendiente && (
        <li>
          <span className="font-bold text-heading">Pendiente de {aprobacion.pendiente.aprobador}</span>
          <span className="block text-sm text-ink-muted">Desde {formatDateTime(aprobacion.pendiente.desde)}. El ticket no se cierra hasta que responda.</span>
        </li>
      )}
      {aprobacion.resueltas.map((item) => (
        <li key={`${item.aprobador}-${item.fecha.toISOString()}`} className="text-sm text-ink-muted">
          {item.resultado === "RETIRADA" ? `${item.aprobador}: solicitud retirada` : `${item.aprobador} ${APPROVAL_RESULT[item.resultado]}`} ·{" "}
          {formatDateTime(item.fecha)}
        </li>
      ))}
    </ul>
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

  // U15: quien abre el ticket ya vio lo que decían sus avisos de él, llegue
  // por la campana, por la bandeja o por un enlace. Antes del marco, para que
  // el número de la campana de esta misma página ya lo descuente.
  await markTicketNoticesRead({ idPersonal: employee.idPersonal, idTicket: ticket.idTicket });

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

  // Lo que se escribe va en un solo cuadro debajo de la descripción, con un
  // botón por acción (03-nov-2026, sin pestañas); cambiar responsable,
  // observadores o pedir aprobación, en el panel de datos, junto a lo que
  // cambian. Solo aparece lo que el estado y el alcance permiten
  // (`capabilities`), con las mismas reglas del servicio.
  // Quien es a la vez responsable y solicitante responde o anota: comentar su
  // propio ticket que atiende sería una tercera forma de decir lo mismo.
  const canComment = capabilities.comentarSolicitante && !capabilities.responder;
  const hasComposer = capabilities.responder || capabilities.notaInterna || canComment;

  return (
    // U17: el ticket abre en su modo, llegue de donde llegue (la campana, un
    // enlace, la otra bandeja), y vuelve a la bandeja de ese modo.
    <AppFrame employee={employee} title={ticket.codigoTicket ?? "Ticket sin código"} mode={ticket.modo}>
      <div className="space-y-4">
        <Link
          href={inboxPath(ticket.modo)}
          className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Volver a la bandeja
        </Link>

        {creado === "1" && (
          <FlashToast
            id={`creado-${ticket.idTicket}`}
            message={`${ticket.codigoTicket ? `Ticket ${ticket.codigoTicket}` : "Ticket"} creado y asignado a ${ticket.responsable ?? "la persona responsable del área"}.`}
            cleanHref={`${APP_BASE_PATH}/tickets/${ticket.idTicket}`}
          />
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

            {hasComposer && (
              <section className={surface()} aria-label="Escribir en el ticket">
                <TicketComposer
                  idTicket={ticket.idTicket}
                  canRespond={capabilities.responder}
                  canComment={canComment}
                  canNote={capabilities.notaInterna}
                  waitingApprovalFrom={ticket.aprobacion.pendiente?.aprobador ?? null}
                />
              </section>
            )}

            <section className={surface()} aria-labelledby="historia-titulo">
              <h2 id="historia-titulo" className={cn(sectionTitle, "mb-4")}>Historia</h2>
              <TicketHistory idTicket={ticket.idTicket} entries={ticket.history} />
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
              <Field label="Área">{ticket.area ? <AreaName area={areaThemeKey(ticket.area)} name={ticket.area} /> : "Sin área"}</Field>
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
                  icon="editar"
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
                  icon="anadir"
                  form={<AddObserversForm idTicket={ticket.idTicket} candidates={observerCandidates} max={MAX_OBSERVERS_PER_ACTION} />}
                >
                  <ObserverList observadores={ticket.observadores} idTicket={ticket.idTicket} canRemove />
                </EditableField>
              ) : (
                <Field label="Observadores">
                  <ObserverList observadores={ticket.observadores} idTicket={ticket.idTicket} canRemove={false} />
                </Field>
              )}
              {capabilities.solicitarValidacion ? (
                <EditableField
                  label="Aprobación"
                  actionLabel="Pedir aprobación"
                  icon="anadir"
                  form={<RequestApprovalForm idTicket={ticket.idTicket} candidates={validationCandidates} />}
                >
                  <ApprovalSummary aprobacion={ticket.aprobacion} />
                </EditableField>
              ) : (
                (ticket.aprobacion.pendiente || ticket.aprobacion.resueltas.length > 0) && (
                  <Field label="Aprobación">
                    <ApprovalSummary aprobacion={ticket.aprobacion} />
                    {capabilities.responderAprobacion && (
                      <div className="mt-2 rounded-control border border-line bg-surface-sunken p-3">
                        <ApprovalResponseForm idTicket={ticket.idTicket} />
                      </div>
                    )}
                    {capabilities.retirarAprobacion && (
                      <div className="mt-2">
                        <WithdrawApprovalForm idTicket={ticket.idTicket} />
                      </div>
                    )}
                  </Field>
                )
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

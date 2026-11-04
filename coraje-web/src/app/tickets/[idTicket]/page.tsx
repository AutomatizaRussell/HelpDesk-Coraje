import { CalendarClock, Clock, Flag, History, Star, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PersonChip } from "@/design-system/components/PersonChip";
import { RatingStars } from "@/design-system/components/RatingStars";
import { TicketHero, type TicketHeroFact } from "@/design-system/patterns/area-hero/TicketHero";
import { MailStateBadge, SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { iconStroke } from "@/design-system/foundations/iconography";
import { badge } from "@/design-system/recipes/badge";
import { sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { areaDisplayName, areaThemeKey } from "@/features/areas/area-theme";
import {
  formatCatalogLabel,
  formatDateTime,
  formatPriority,
  formatShortDate,
  formatShortDateTime,
  personDisplayName,
  personInitials,
} from "@/features/tickets/format";
import {
  AddObserversForm,
  ApprovalResponseForm,
  RatingForm,
  ReassignForm,
  RemoveObserverForm,
  RequestApprovalForm,
  ResendMailForm,
  TicketComposer,
  WithdrawApprovalForm,
} from "@/features/tickets/TicketActionForms";
import { EditableField } from "@/features/tickets/TicketDetailActions";
import { TicketHistory, TicketRequest } from "@/features/tickets/TicketHistory";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { markTicketNoticesRead } from "@/server/notifications/ticket-notices";
import { listTicketMail } from "@/server/notifications/ticket-notifications";
import { MAX_OBSERVERS_PER_ACTION } from "@/server/tickets/follow-rules";
import { SLA_STATUS_LABEL, plazoFraction } from "@/server/tickets/sla";
import { isOpenState } from "@/server/tickets/ticket-state";
import { inboxPath } from "@/server/tickets/ticket-mode";
import {
  getPlazoProgress,
  getTicketDetail,
  listFollowCandidates,
  listReassignCandidates,
  type TicketDetail,
} from "@/server/tickets/ticket-queries";

/**
 * Detalle de un ticket (U31, maqueta aprobada «U»): arriba, la cabecera en el
 * color del área del ticket con el código, el estado y los datos fijos;
 * debajo, descripción, cuadro para escribir e historia a la izquierda, y
 * personas y correos a la derecha, cada dato con su acción al lado (opción B,
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
export default async function TicketDetailPage({ params }: { params: Promise<{ idTicket: string }> }) {
  const { idTicket } = await params;
  const employee = await requireCurrentEmployee(`/tickets/${idTicket}`);
  if (!z.uuid().safeParse(idTicket).success) notFound();

  const ticket = await getTicketDetail({ idPersonal: employee.idPersonal, idTicket });
  if (!ticket) notFound();

  // U15: quien abre el ticket ya vio lo que decían sus avisos de él, llegue
  // por la campana, por la bandeja o por un enlace. Antes del marco, para que
  // el número de la campana de esta misma página ya lo descuente.
  await markTicketNoticesRead({ idPersonal: employee.idPersonal, idTicket: ticket.idTicket });

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
  // observadores o pedir aprobación, en el panel de la derecha, junto a lo que
  // cambian. Solo aparece lo que el estado y el alcance permiten
  // (`capabilities`), con las mismas reglas del servicio.
  // Quien es a la vez responsable y solicitante responde o anota: comentar su
  // propio ticket que atiende sería una tercera forma de decir lo mismo.
  const canComment = capabilities.comentarSolicitante && !capabilities.responder;
  const hasComposer = capabilities.responder || capabilities.notaInterna || canComment;

  // U31: la cabecera lleva lo que antes era la columna de datos fijos. U32:
  // en una tira con icono por dato (maqueta «W-9»), nombres en tipo oración y
  // fechas cortas, que antes partían las cajas en tres líneas.
  const categorias = [ticket.categoria1, ticket.categoria2].flatMap((value) => (value ? [formatCatalogLabel(value)] : [])).join(" · ");
  const terminado = !isOpenState(ticket.estado);
  // Terminado: si se cerró dentro del plazo. Abierto: cómo va (`slaStatus`).
  const plazoDetail = terminado
    ? ticket.fechaLimite && ticket.fechaResolucion
      ? ticket.fechaResolucion <= ticket.fechaLimite
        ? "Cumplido"
        : "Fuera de plazo"
      : null
    : ticket.sla
      ? SLA_STATUS_LABEL[ticket.sla]
      : null;
  const facts: TicketHeroFact[] = [
    {
      label: "Solicitante",
      value: ticket.solicitante ? personDisplayName(ticket.solicitante) : "Sin solicitante",
      initials: ticket.solicitante ? personInitials(ticket.solicitante) : "",
      weight: 3,
    },
    {
      label: "Plazo",
      icon: CalendarClock,
      value: ticket.fechaLimite ? formatShortDate(ticket.fechaLimite) : "Sin fecha límite",
      detail: plazoDetail,
      alert: ticket.sla === "VENCIDO",
      weight: 2,
    },
    { label: "Prioridad", icon: Flag, value: ticket.prioridad ? formatPriority(ticket.prioridad) : "Sin prioridad" },
    { label: "Tipo", icon: Tag, value: ticket.tipo ? formatCatalogLabel(ticket.tipo) : "Sin tipo", detail: categorias || null, weight: 2 },
    {
      label: "Radicado",
      icon: Clock,
      value: formatShortDateTime(ticket.fechaCreacion),
      detail: ticket.fechaResolucion ? `Cerrado ${formatShortDateTime(ticket.fechaResolucion)}` : null,
      weight: 3,
    },
    // U34: la calificación es un dato del ticket, visible para quien lo consulta.
    ...(ticket.calificacion !== null
      ? [{ label: "Calificación", icon: Star, value: <RatingStars value={ticket.calificacion} />, weight: 2 as const }]
      : []),
  ];

  // U32: el anillo de plazo. Sin fecha límite, o terminado sin fecha de
  // cierre (algunos legacy), no hay plazo que medir: solo la pista.
  const progress =
    ticket.fechaLimite && (!terminado || ticket.fechaResolucion) ? await getPlazoProgress(ticket.idTicket) : null;
  const plazo = progress
    ? {
        fraction: plazoFraction({ ...progress, vencido: ticket.sla === "VENCIDO" }),
        label: terminado
          ? `Se cerró con ${Math.min(progress.consumidos, progress.total)} de ${progress.total} días hábiles del plazo consumidos`
          : ticket.sla === "VENCIDO"
            ? `Plazo vencido: ${progress.total} de ${progress.total} días hábiles consumidos`
            : `Plazo: ${progress.consumidos} de ${progress.total} días hábiles consumidos`,
      }
    : { fraction: null, label: "Sin plazo que medir" };
  const card = cn(surface(), "shadow-raised");

  return (
    // U17: el ticket abre en su modo, llegue de donde llegue (la campana, un
    // enlace, la otra bandeja), y vuelve a la bandeja de ese modo.
    <AppFrame
      employee={employee}
      title={ticket.codigoTicket ?? "Ticket sin código"}
      mode={ticket.modo}
      hero={() => (
        <TicketHero
          area={areaThemeKey(ticket.area)}
          code={ticket.codigoTicket ?? "Sin código"}
          back={{ href: inboxPath(ticket.modo), label: "Volver a la bandeja" }}
          badges={
            <>
              {ticket.area && (
                <span className="inline-flex h-6 items-center rounded-pill bg-accent px-2.5 text-xs font-bold text-on-accent">
                  {areaDisplayName(ticket.area)}
                </span>
              )}
              <TicketStateBadge state={ticket.estado} />
              {ticket.sla && ticket.sla !== "EN_PLAZO" && <SlaBadge status={ticket.sla} />}
              {/* Corte 69: antes, un aviso a todo lo ancho sobre el contenido.
                  La etiqueta dice de dónde viene, junto al estado; que aquí no
                  se gestiona ya se ve: no hay cuadro de escritura ni acciones. */}
              {!ticket.operable && (
                <span className={badge("neutral")}>
                  <History aria-hidden className="size-3" strokeWidth={iconStroke.regular} />
                  De PowerApps
                </span>
              )}
            </>
          }
          facts={facts}
          plazo={plazo}
        />
      )}
    >
      <div className="space-y-5">

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <section className={card} aria-label="Solicitud">
              <TicketRequest author={ticket.solicitante} fecha={ticket.fechaCreacion} text={ticket.descripcion} />
            </section>

            {hasComposer && (
              <section className={card} aria-label="Escribir en el ticket">
                <TicketComposer
                  idTicket={ticket.idTicket}
                  canRespond={capabilities.responder}
                  canComment={canComment}
                  canNote={capabilities.notaInterna}
                  waitingApprovalFrom={ticket.aprobacion.pendiente?.aprobador ?? null}
                  solicitante={ticket.solicitante}
                />
              </section>
            )}

            {/* U34: solo quien radicó, con el ticket cerrado y sin calificar. */}
            {capabilities.calificar && (
              <section className={card} aria-label="Calificar la atención">
                <RatingForm idTicket={ticket.idTicket} />
              </section>
            )}

            <section className={card} aria-labelledby="historia-titulo">
              <h2 id="historia-titulo" className={cn(sectionTitle, "mb-4")}>Historia</h2>
              <TicketHistory idTicket={ticket.idTicket} entries={ticket.history} />
            </section>
          </div>

          <aside className="space-y-5" aria-label="Personas y correos del ticket">
            <section className={card} aria-label="Personas">
              <dl className="divide-y divide-line">
                {capabilities.reasignar ? (
                  <EditableField
                    label="Responsable"
                    actionLabel="Cambiar responsable"
                    icon="editar"
                    form={<ReassignForm idTicket={ticket.idTicket} candidates={reassignCandidates} />}
                  >
                    <PersonChip
                      name={ticket.responsable}
                      initials={ticket.responsable ? personInitials(ticket.responsable) : ""}
                      emptyLabel="Sin responsable"
                    />
                  </EditableField>
                ) : (
                  <Field label="Responsable">
                    <PersonChip
                      name={ticket.responsable}
                      initials={ticket.responsable ? personInitials(ticket.responsable) : ""}
                      emptyLabel="Sin responsable"
                    />
                  </Field>
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
              </dl>
            </section>

            {mails.length > 0 && (
              <section className={card} aria-labelledby="correos-titulo">
                <h2 id="correos-titulo" className={cn(sectionTitle, "mb-2")}>Correos</h2>
                <ul className="divide-y divide-line">
                  {mails.map((mail) => (
                    <li key={mail.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink">{mail.asunto}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          Para {mail.destinatario} · <span className="tabular-nums">{formatDateTime(mail.fecha)}</span>
                        </p>
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
          </aside>
        </div>
      </div>
    </AppFrame>
  );
}

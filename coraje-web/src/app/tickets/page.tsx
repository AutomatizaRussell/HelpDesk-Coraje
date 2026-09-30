import Link from "next/link";
import { Plus } from "lucide-react";

import { SegmentedLinks } from "@/design-system/components/SegmentedLinks";
import { iconStroke } from "@/design-system/foundations/iconography";
import { SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { buttonRecipe } from "@/design-system/recipes/button";
import { focusRing } from "@/design-system/recipes/interaction";
import { badge } from "@/design-system/recipes/badge";
import { notice, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { formatDate } from "@/features/tickets/format";
import { InboxSearch } from "@/features/tickets/InboxSearch";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import {
  INBOX_SEARCH_MAX,
  INBOX_VIEWS,
  countInbox,
  isInboxView,
  listInbox,
  type InboxCounts,
  type InboxFilters,
  type InboxView,
} from "@/server/tickets/ticket-queries";
import { TICKET_STATES, TICKET_STATE_LABEL, isTicketState } from "@/server/tickets/ticket-state";

/**
 * Bandeja de tickets (design/sistema-helpdesk.md §6: densidad y escaneo).
 *
 * La vista, los filtros y la página viajan en la URL, así que volver del
 * detalle deja la bandeja donde estaba y una búsqueda se puede compartir. El
 * alcance de lo que se lista lo decide la consulta (`listInbox`), no esta
 * vista.
 *
 * U11, a partir del prototipo de TI: contadores arriba, búsqueda y filtro por
 * estado, y la vista «En seguimiento». La búsqueda filtra mientras se escribe
 * (`InboxSearch`) y sigue siendo un formulario GET sin JavaScript: no es una
 * acción, solo otra URL.
 */
const VIEW_LABEL: Record<InboxView, string> = {
  pendientes: "Por atender",
  radicados: "Radicados por mí",
  abiertos: "Abiertos",
  siguiendo: "En seguimiento",
  terminados: "Terminados",
};

const EMPTY_MESSAGE: Record<InboxView, string> = {
  pendientes: "No tienes tickets por atender.",
  radicados: "No has radicado tickets.",
  abiertos: "No hay tickets abiertos a tu alcance.",
  siguiendo: "No tienes tickets en seguimiento. Aparecen aquí cuando te añaden como observador o te piden una validación.",
  terminados: "No hay tickets terminados en tu alcance.",
};

function inboxHref(view: InboxView, filters: InboxFilters, page = 1): string {
  const query = new URLSearchParams({ vista: view });
  if (filters.texto) query.set("q", filters.texto);
  if (filters.estado) query.set("estado", filters.estado);
  if (page > 1) query.set("pagina", String(page));
  return `/tickets?${query.toString()}`;
}

/**
 * Tarjetas de conteo sobre todo el alcance de la persona. «Vencidos» en vez
 * del «SLA cumplido» del prototipo, que contaba cerrados entre total: eso no
 * dice nada del plazo (`countInbox`).
 */
function InboxCountCards({ counts }: { counts: InboxCounts }) {
  const cards = [
    ...TICKET_STATES.map((state) => ({ key: state, label: TICKET_STATE_LABEL[state], value: counts.porEstado[state] })),
    { key: "VENCIDOS", label: "Vencidos", value: counts.vencidos },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.key} className={cn(surface({ padded: false }), "px-4 py-3")}>
          <dt className="text-sm text-ink-muted">{card.label}</dt>
          <dd className={cn("mt-1 text-xl font-bold tabular-nums", card.key === "VENCIDOS" && card.value > 0 ? "text-danger" : "text-heading")}>
            {card.value.toLocaleString("es-CO")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pagina?: string; q?: string; estado?: string }>;
}) {
  const employee = await requireCurrentEmployee("/tickets");
  const params = await searchParams;
  const view: InboxView = isInboxView(params.vista) ? params.vista : "pendientes";
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  // La URL es entrada externa: un texto demasiado largo se recorta y un
  // estado desconocido se ignora, en vez de fallar.
  const texto = params.q?.trim().slice(0, INBOX_SEARCH_MAX) || null;
  const filters: InboxFilters = { texto, estado: params.estado && isTicketState(params.estado) ? params.estado : null };
  const filtering = filters.texto !== null || filters.estado !== null;

  const [inbox, counts, canCreate] = await Promise.all([
    listInbox({ idPersonal: employee.idPersonal, view, page, filters }),
    countInbox(employee.idPersonal),
    // Misma regla que exige la creación: no se ofrece lo que se va a rechazar.
    resolveGrant(employee.idPersonal, TICKET_ACTIONS.crear).then(Boolean),
  ]);

  return (
    <AppFrame employee={employee} title="Bandeja de tickets">
      {inbox === null ? (
        <p className={notice("warning")}>No tienes permiso para consultar tickets.</p>
      ) : (
        <div className="space-y-4">
          {counts && <InboxCountCards counts={counts} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedLinks
              label="Vistas de la bandeja"
              items={INBOX_VIEWS.map((item) => ({ label: VIEW_LABEL[item], href: inboxHref(item, filters), current: item === view }))}
            />
            {canCreate && (
              <Link href="/tickets/nuevo" className={buttonRecipe({ variant: "primary" })}>
                <Plus aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
                Nuevo ticket
              </Link>
            )}
          </div>

          <InboxSearch
            view={view}
            texto={filters.texto}
            estado={filters.estado}
            maxLength={INBOX_SEARCH_MAX}
            clearHref={inboxHref(view, { texto: null, estado: null })}
          />

          <section className={surface({ padded: false })} aria-label={VIEW_LABEL[view]}>
            {inbox.rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-ink-muted">
                {filtering ? "Ningún ticket de esta vista coincide con la búsqueda." : EMPTY_MESSAGE[view]}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="border-b border-line bg-surface-sunken text-sm text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-bold">Ticket</th>
                      <th scope="col" className="px-4 py-2.5 font-bold">Estado</th>
                      <th scope="col" className="px-4 py-2.5 font-bold">Plazo</th>
                      <th scope="col" className="px-4 py-2.5 font-bold">Área y tipo</th>
                      <th scope="col" className="px-4 py-2.5 font-bold">Solicitante</th>
                      <th scope="col" className="px-4 py-2.5 font-bold">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inbox.rows.map((row) => (
                      // Toda la fila abre el ticket con un solo enlace, el del
                      // código, que se extiende sobre la fila (`after:inset-0`).
                      // Un enlace por fila y no un onClick en <tr>: funciona con
                      // teclado, lector de pantalla y clic central para abrir en
                      // otra pestaña. La fila no tiene otros controles.
                      <tr
                        key={row.idTicket}
                        className="relative cursor-pointer align-top hover:bg-surface-sunken focus-within:bg-surface-sunken"
                      >
                        <td className="max-w-md px-4 py-3">
                          <Link
                            href={`/tickets/${row.idTicket}`}
                            className={cn(
                              "rounded-control font-bold text-heading underline-offset-2 after:absolute after:inset-0 hover:underline",
                              focusRing,
                            )}
                          >
                            {row.codigoTicket ?? "Sin código"}
                          </Link>
                          <p className="mt-0.5 truncate text-sm text-ink-muted">{row.descripcion}</p>
                          {!row.operable && <p className="mt-0.5 text-xs text-ink-muted">De PowerApps · solo consulta</p>}
                          {row.validacionParaMi && <p className="mt-1"><span className={badge("info")}>Te pidieron validar</span></p>}
                        </td>
                        <td className="px-4 py-3">
                          <TicketStateBadge state={row.estado} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {row.fechaLimite ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="tabular-nums">{formatDate(row.fechaLimite)}</span>
                              {row.sla && row.sla !== "EN_PLAZO" && <SlaBadge status={row.sla} />}
                            </div>
                          ) : (
                            <span className="text-ink-muted">Sin fecha</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p>{row.area ?? "Sin área"}</p>
                          {row.tipo && <p className="text-sm text-ink-muted">{row.tipo}</p>}
                        </td>
                        <td className="px-4 py-3">{row.solicitante ?? "—"}</td>
                        <td className="px-4 py-3">{row.responsable ?? "Sin responsable"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {inbox.pageCount > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm text-ink-muted">
              <span>
                Página {inbox.page} de {inbox.pageCount} · {inbox.total.toLocaleString("es-CO")} tickets
              </span>
              <div className="flex gap-2">
                {inbox.page > 1 && (
                  <Link href={inboxHref(view, filters, inbox.page - 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                    Anterior
                  </Link>
                )}
                {inbox.page < inbox.pageCount && (
                  <Link href={inboxHref(view, filters, inbox.page + 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                    Siguiente
                  </Link>
                )}
              </div>
            </nav>
          )}
        </div>
      )}
    </AppFrame>
  );
}

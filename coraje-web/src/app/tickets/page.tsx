import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { PersonChip } from "@/design-system/components/PersonChip";
import { TabLinks } from "@/design-system/components/TabLinks";
import { AreaHero, type HeroStat } from "@/design-system/patterns/area-hero/AreaHero";
import { AreaTile } from "@/design-system/patterns/area/AreaTile";
import { EmptyState } from "@/design-system/patterns/empty-state/EmptyState";
import { FlashToast } from "@/design-system/patterns/toast/Toaster";
import { iconStroke } from "@/design-system/foundations/iconography";
import { TICKET_STATE_TONE } from "@/design-system/patterns/ticket-status/ticket-status";
import { SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { buttonRecipe } from "@/design-system/recipes/button";
import { colorTransition, focusRing } from "@/design-system/recipes/interaction";
import { badge } from "@/design-system/recipes/badge";
import { notice } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { areaDisplayName, areaShortCode, areaThemeKey } from "@/features/areas/area-theme";
import { formatCatalogLabel, formatDate, formatDateTime, personDisplayName, personInitials } from "@/features/tickets/format";
import { inboxSummary } from "@/features/tickets/inbox-summary";
import { InboxSearch } from "@/features/tickets/InboxSearch";
import { AppFrame } from "@/features/shell/AppFrame";
import { InboxModeSwitch } from "@/features/shell/InboxModeSwitch";
import { greetingFor, greetingName, longDateLabel } from "@/features/shell/greeting";
import { APP_BASE_PATH } from "@/server/auth/base-path";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { getModeAccess } from "@/server/tickets/mode-access";
import { modeQuery, parseTicketMode, type TicketMode } from "@/server/tickets/ticket-mode";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import {
  INBOX_SEARCH_MAX,
  countInbox,
  inboxViews,
  isInboxView,
  listInbox,
  type InboxCounts,
  type InboxFilters,
  type InboxView,
  viewAllowsStateFilter,
} from "@/server/tickets/ticket-queries";
import { TICKET_STATE_LABEL, isInboxStateFilter, type TicketState } from "@/server/tickets/ticket-state";

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
 *
 * U30: arriba, la cabecera del área de quien entra (saludo, plazo en una
 * frase, acción y cifras); debajo, la bandeja en una tarjeta que se monta
 * sobre la cabecera, con las vistas como pestañas, el estado y el plazo con
 * icono, el área con su recuadro de color y el responsable con sus iniciales.
 *
 * U17: la misma bandeja sirve a los dos modos. `?modo=externo` lista los
 * tickets de clientes, con sus vistas (`inboxViews`), y el shell se pinta en
 * navy; sin parámetro es la bandeja de siempre. Quien no tiene trabajo con
 * clientes que pida `modo=externo` ve la de siempre.
 */
const VIEW_LABEL: Record<InboxView, string> = {
  pendientes: "Por atender",
  redirigir: "Por redirigir",
  radicados: "Radicados por mí",
  siguiendo: "En seguimiento",
  alcance: "Todo mi alcance",
};

/**
 * Estado vacío de cada vista (U30): un título corto que dice qué no hay y una
 * línea que dice cuándo habrá. Con filtros, el vacío es de la búsqueda, no de
 * la vista.
 */
function emptyState(view: InboxView, mode: TicketMode): { title: string; text: string } {
  const tickets = mode === "externo" ? "tickets de clientes" : "tickets";
  switch (view) {
    case "pendientes":
      return { title: "Nada por atender", text: `Cuando te asignen ${tickets} o te pidan aprobar uno, aparecerán aquí.` };
    case "redirigir":
      return { title: "Nada por redirigir", text: "Los tickets de clientes que lleguen sin área aparecerán aquí." };
    case "radicados":
      return { title: "Aún no has radicado tickets", text: "Los que crees aparecerán aquí, con su estado al día." };
    case "siguiendo":
      return { title: "Nada en seguimiento", text: "Cuando te añadan como observador de un ticket, aparecerá aquí." };
    case "alcance":
      return { title: `Sin ${tickets} a tu alcance`, text: "Cuando haya tickets que puedas consultar, aparecerán aquí." };
  }
}

/**
 * Forma de `codigo_ticket` (helpdesk.next_codigo_ticket): «{área}-{AAAAMM}-{n}»
 * desde U29 (03-nov-2026) y «{área}-{año}-{consecutivo}» antes; las dos
 * existen. El aviso de «redirigido» solo repite el parámetro si tiene una de
 * esas formas: un enlace fabricado no puede poner texto propio en esta
 * pantalla, igual que en `/login`.
 */
const TICKET_CODE = /^[A-Z0-9]{1,10}-(?:\d{6}-\d{1,6}|\d{4}-\d{4,6})$/;

function inboxHref(mode: TicketMode, view: InboxView, filters: InboxFilters, page = 1): string {
  const query = modeQuery(mode);
  query.set("vista", view);
  if (filters.texto) query.set("q", filters.texto);
  // El estado no viaja a la vista que lo fija ya: ahí no significaría nada.
  if (filters.estado && viewAllowsStateFilter(view)) query.set("estado", filters.estado);
  if (page > 1) query.set("pagina", String(page));
  return `/tickets?${query.toString()}`;
}

/**
 * Las cifras de la cabecera, sobre todo el alcance de la persona
 * (`countInbox`): una por cada opción del filtro de estado
 * (`INBOX_STATE_FILTERS`), con el tono de su insignia, y los vencidos después
 * de los abiertos y asignados, que son los que todavía se pueden atender.
 * «Vencidos» y no el «SLA cumplido» del prototipo de TI, que contaba cerrados
 * entre total y no decía nada del plazo. Sin «Rechazado»: rechazar se retiró
 * en U29 y la cifra sería siempre cero.
 */
function heroStats(counts: InboxCounts): HeroStat[] {
  const state = (key: TicketState): HeroStat => ({ label: TICKET_STATE_LABEL[key], value: counts.porEstado[key], tone: TICKET_STATE_TONE[key] });
  return [state("ABIERTO"), state("ASIGNADO"), { label: "Vencidos", value: counts.vencidos, tone: "danger" }, state("CERRADO")];
}

/** La cabecera del área de la bandeja (U30): saludo, plazo en una frase, acción y cifras. */
function InboxHero({
  areaName,
  employeeName,
  counts,
  canCreate,
}: {
  areaName: string | null;
  employeeName: string;
  counts: InboxCounts | null;
  canCreate: boolean;
}) {
  const now = new Date();
  return (
    <AreaHero
      areaName={areaName ? areaDisplayName(areaName) : null}
      title={`${greetingFor(now)}, ${greetingName(employeeName)}`}
      summary={
        <>
          {longDateLabel(now)}.{" "}
          {counts &&
            inboxSummary(counts.vencidos, counts.porVencer).map((part) =>
              part.alert ? (
                <strong key={part.text} className="font-bold text-danger">
                  {part.text}
                </strong>
              ) : (
                <span key={part.text}>{part.text}</span>
              ),
            )}
        </>
      }
      action={
        canCreate && (
          <Link href="/tickets/nuevo" className={buttonRecipe({ variant: "primary", size: "lg" })}>
            <Plus aria-hidden className="size-4.5" strokeWidth={iconStroke.regular} />
            Nuevo ticket
          </Link>
        )
      }
      stats={counts ? heroStats(counts) : []}
    />
  );
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    modo?: string;
    vista?: string;
    pagina?: string;
    q?: string;
    estado?: string;
    redirigido?: string;
    correo?: string;
  }>;
}) {
  const employee = await requireCurrentEmployee("/tickets");
  const params = await searchParams;
  const access = await getModeAccess(employee.idPersonal);
  const mode: TicketMode = parseTicketMode(params.modo) === "externo" && access.externo ? "externo" : "interno";
  const views = inboxViews(mode, access);
  // Una vista de otro modo, o desconocida, abre la primera de este.
  const view: InboxView = isInboxView(params.vista) && views.includes(params.vista) ? params.vista : views[0];
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  // La URL es entrada externa: un texto demasiado largo se recorta y un
  // estado desconocido se ignora, en vez de fallar.
  const texto = params.q?.trim().slice(0, INBOX_SEARCH_MAX) || null;
  const estado = params.estado && isInboxStateFilter(params.estado) && viewAllowsStateFilter(view) ? params.estado : null;
  const filters: InboxFilters = { texto, estado };
  const filtering = filters.texto !== null || filters.estado !== null;

  const [inbox, counts, canCreate] = await Promise.all([
    listInbox({ idPersonal: employee.idPersonal, view, mode, page, filters }),
    countInbox(employee.idPersonal, mode),
    // Misma regla que exige la creación: no se ofrece lo que se va a rechazar.
    // Solo en Interno, por ahora: la creación todavía no recibe cliente
    // (`chk_fact_ticket_origen_exclusivo`, tickets.md §7.1). En PowerApps un
    // empleado sí radica a nombre de un cliente; eso llega con U21.
    mode === "interno" ? resolveGrant(employee.idPersonal, TICKET_ACTIONS.crear).then(Boolean) : false,
  ]);


  const empty = emptyState(view, mode);

  return (
    <AppFrame
      employee={employee}
      title={mode === "externo" ? "Tickets de clientes" : "Bandeja de tickets"}
      mode={mode}
      // Sin permiso de consulta no hay nada que resumir: ni cabecera ni cifras.
      hero={({ areaName }) =>
        inbox === null ? null : <InboxHero areaName={areaName} employeeName={employee.nombreCompleto} counts={counts} canCreate={canCreate} />
      }
    >
      {inbox === null ? (
        <p className={notice("warning")}>No tienes permiso para consultar tickets.</p>
      ) : (
        <div className="space-y-4">
          {params.redirigido && (
            <FlashToast
              id={`redirigido-${params.redirigido}`}
              message={TICKET_CODE.test(params.redirigido) ? `Ticket ${params.redirigido} redirigido a su área.` : "Ticket redirigido a su área."}
              cleanHref={`${APP_BASE_PATH}${inboxHref(mode, view, filters)}`}
            />
          )}
          {params.correo === "fallido" && (
            <p className={notice("warning")}>Un correo de este cambio no salió. Queda registrado en el ticket para reenviarlo.</p>
          )}

          <section aria-label={VIEW_LABEL[view]} className="overflow-hidden rounded-surface bg-surface shadow-raised">
            {/* En móvil, el interruptor de modo va encima de las vistas: en la
                misma fila les dejaba sitio para una sola pestaña. */}
            <div className="flex flex-col-reverse items-start gap-x-4 border-b border-line px-6 sm:flex-row sm:items-center sm:justify-between">
              <TabLinks
                label="Vistas de la bandeja"
                items={views.map((item) => ({ label: VIEW_LABEL[item], href: inboxHref(mode, item, filters), current: item === view }))}
              />
              <InboxModeSwitch idPersonal={employee.idPersonal} mode={mode} />
            </div>
            <div className="border-b border-line px-6 py-4">
              <InboxSearch
                modo={mode === "externo" ? "externo" : null}
                view={view}
                texto={filters.texto}
                estado={filters.estado}
                showEstado={viewAllowsStateFilter(view)}
                maxLength={INBOX_SEARCH_MAX}
                clearHref={inboxHref(mode, view, { texto: null, estado: null })}
              />
            </div>

            {inbox.rows.length === 0 ? (
              filtering ? (
                <EmptyState title="Sin resultados">Ningún ticket de esta vista coincide con la búsqueda.</EmptyState>
              ) : (
                <EmptyState title={empty.title}>{empty.text}</EmptyState>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="border-b border-line text-sm text-ink-muted">
                    <tr>
                      <th scope="col" className="px-6 pt-4 pb-2.5 font-bold">Ticket</th>
                      <th scope="col" className="px-3 pt-4 pb-2.5 font-bold">Estado</th>
                      {/* Lo que espera área todavía no tiene plazo: empieza al redirigirlo. */}
                      <th scope="col" className="px-3 pt-4 pb-2.5 font-bold">{view === "redirigir" ? "Radicado" : "Plazo"}</th>
                      <th scope="col" className="px-3 pt-4 pb-2.5 font-bold">Área y tipo</th>
                      <th scope="col" className="px-3 pt-4 pb-2.5 font-bold">Solicitante</th>
                      <th scope="col" className="px-3 pt-4 pb-2.5 font-bold">Responsable</th>
                      <th scope="col" className="w-10"><span className="sr-only">Abrir</span></th>
                    </tr>
                  </thead>
                  {/* `data-stagger`: las filas suben una tras otra al aparecer
                      (globals.css). Solo entran las nuevas: React conserva las
                      que ya estaban al buscar o cambiar de página. */}
                  <tbody data-stagger className="divide-y divide-line">
                    {inbox.rows.map((row) => (
                      // Toda la fila abre el ticket con un solo enlace, el del
                      // código, que se extiende sobre la fila (`after:inset-0`).
                      // Un enlace por fila y no un onClick en <tr>: funciona con
                      // teclado, lector de pantalla y clic central para abrir en
                      // otra pestaña. La fila no tiene otros controles.
                      <tr
                        key={row.idTicket}
                        className={cn(
                          "group relative animate-rise cursor-pointer align-top hover:bg-surface-sunken focus-within:bg-surface-sunken",
                          colorTransition,
                        )}
                      >
                        <td className="px-6 py-3.5">
                          <Link
                            href={view === "redirigir" ? `/redirigir/${row.idTicket}` : `/tickets/${row.idTicket}`}
                            className={cn(
                              "rounded-control font-bold tabular-nums text-heading underline-offset-3 after:absolute after:inset-0 group-hover:underline",
                              focusRing,
                            )}
                          >
                            {row.codigoTicket ?? "Sin código"}
                          </Link>
                          {/* Corte 71: el ancho máximo de una celda no limita la tabla; el de un
                              bloque dentro de ella sí. Sin esto, la descripción
                              ensanchaba la columna y la tabla se cortaba. */}
                          <p className="mt-0.5 max-w-sm truncate text-sm text-ink-muted">{row.descripcion}</p>
                          {!row.operable && <p className="mt-0.5 text-xs text-ink-muted">De PowerApps</p>}
                          {row.validacionParaMi && <p className="mt-1"><span className={badge("info")}>Te piden aprobar</span></p>}
                        </td>
                        <td className="px-3 py-3.5">
                          <TicketStateBadge state={row.estado} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          {view === "redirigir" ? (
                            <span className="tabular-nums">{formatDateTime(row.fechaCreacion)}</span>
                          ) : row.fechaLimite ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className={cn("tabular-nums", row.sla === "VENCIDO" && "font-bold text-danger")}>{formatDate(row.fechaLimite)}</span>
                              {row.sla && row.sla !== "EN_PLAZO" && <SlaBadge status={row.sla} />}
                            </div>
                          ) : (
                            <span className="text-ink-muted">Sin fecha</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          {row.area ? (
                            <AreaTile
                              area={areaThemeKey(row.area)}
                              code={areaShortCode(row.area)}
                              name={areaDisplayName(row.area)}
                              detail={row.tipo ? formatCatalogLabel(row.tipo) : null}
                            />
                          ) : (
                            <>
                              <p>Sin área</p>
                              {row.tipo && <p className="text-sm text-ink-muted">{formatCatalogLabel(row.tipo)}</p>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3.5">{row.solicitante ? personDisplayName(row.solicitante) : "—"}</td>
                        <td className="px-3 py-3.5">
                          <PersonChip
                            name={row.responsable ? personDisplayName(row.responsable) : null}
                            initials={row.responsable ? personInitials(row.responsable) : ""}
                            emptyLabel="Sin responsable"
                          />
                        </td>
                        <td className="py-3.5 pr-4 text-heading">
                          {/* Señal de «esta fila se abre»: aparece al pasar el
                              ratón o al llegar con el teclado. Decorativa. */}
                          <ChevronRight
                            aria-hidden
                            className="size-4.5 -translate-x-1 opacity-0 transition duration-(--hd-motion-fast) ease-standard group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
                            strokeWidth={iconStroke.regular}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {inbox.pageCount > 1 && (
              <nav aria-label="Páginas" className="flex items-center justify-between gap-3 border-t border-line px-6 py-3.5 text-sm text-ink-muted">
                <span>
                  Página {inbox.page} de {inbox.pageCount} · {inbox.total.toLocaleString("es-CO")} tickets
                </span>
                <div className="flex gap-2">
                  {inbox.page > 1 && (
                    <Link href={inboxHref(mode, view, filters, inbox.page - 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                      Anterior
                    </Link>
                  )}
                  {inbox.page < inbox.pageCount && (
                    <Link href={inboxHref(mode, view, filters, inbox.page + 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                      Siguiente
                    </Link>
                  )}
                </div>
              </nav>
            )}
          </section>
        </div>
      )}
    </AppFrame>
  );
}

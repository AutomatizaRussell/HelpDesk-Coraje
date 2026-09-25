import Link from "next/link";
import { Plus } from "lucide-react";

import { SegmentedLinks } from "@/design-system/components/SegmentedLinks";
import { iconStroke } from "@/design-system/foundations/iconography";
import { SlaBadge, TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { buttonRecipe } from "@/design-system/recipes/button";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { formatDate } from "@/features/tickets/format";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { INBOX_VIEWS, isInboxView, listInbox, type InboxView } from "@/server/tickets/ticket-queries";

/**
 * Bandeja de tickets (design/sistema-helpdesk.md §6: densidad y escaneo).
 *
 * La vista y la página viajan en la URL, así que volver del detalle deja la
 * bandeja donde estaba. El alcance de lo que se lista lo decide la consulta
 * (`listInbox`), no esta vista.
 */
const VIEW_LABEL: Record<InboxView, string> = {
  pendientes: "Por atender",
  radicados: "Radicados por mí",
  area: "Abiertos de mi área",
  terminados: "Terminados",
};

const EMPTY_MESSAGE: Record<InboxView, string> = {
  pendientes: "No tienes tickets por atender.",
  radicados: "No has radicado tickets.",
  area: "Tu área no tiene tickets abiertos.",
  terminados: "No hay tickets terminados en tu alcance.",
};

function inboxHref(view: InboxView, page = 1): string {
  return page > 1 ? `/tickets?vista=${view}&pagina=${page}` : `/tickets?vista=${view}`;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pagina?: string }>;
}) {
  const employee = await requireCurrentEmployee("/tickets");
  const params = await searchParams;
  const view: InboxView = isInboxView(params.vista) ? params.vista : "pendientes";
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [inbox, canCreate] = await Promise.all([
    listInbox({ idPersonal: employee.idPersonal, view, page }),
    // Misma regla que exige la creación: no se ofrece lo que se va a rechazar.
    resolveGrant(employee.idPersonal, TICKET_ACTIONS.crear).then(Boolean),
  ]);

  return (
    <AppFrame employee={employee} title="Bandeja de tickets">
      {inbox === null ? (
        <p className={notice("warning")}>No tienes permiso para consultar tickets.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedLinks
              label="Vistas de la bandeja"
              items={INBOX_VIEWS.map((item) => ({ label: VIEW_LABEL[item], href: inboxHref(item), current: item === view }))}
            />
            {canCreate && (
              <Link href="/tickets/nuevo" className={buttonRecipe({ variant: "primary" })}>
                <Plus aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
                Nuevo ticket
              </Link>
            )}
          </div>

          <section className={surface({ padded: false })} aria-label={VIEW_LABEL[view]}>
            {inbox.rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-ink-muted">{EMPTY_MESSAGE[view]}</p>
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
                      <tr key={row.idTicket} className="align-top hover:bg-surface-sunken">
                        <td className="max-w-md px-4 py-3">
                          <Link
                            href={`/tickets/${row.idTicket}`}
                            className={cn("rounded-control font-bold text-heading underline-offset-2 hover:underline", focusRing)}
                          >
                            {row.codigoTicket ?? "Sin código"}
                          </Link>
                          <p className="mt-0.5 truncate text-sm text-ink-muted">{row.descripcion}</p>
                          {!row.operable && <p className="mt-0.5 text-xs text-ink-muted">De PowerApps · solo consulta</p>}
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
                  <Link href={inboxHref(view, inbox.page - 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                    Anterior
                  </Link>
                )}
                {inbox.page < inbox.pageCount && (
                  <Link href={inboxHref(view, inbox.page + 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
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

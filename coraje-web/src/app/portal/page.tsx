import Link from "next/link";
import { Plus } from "lucide-react";

import { iconStroke } from "@/design-system/foundations/iconography";
import { PortalShell } from "@/design-system/patterns/portal-shell/PortalShell";
import { TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { buttonRecipe } from "@/design-system/recipes/button";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { signOutPortalAction } from "@/features/portal/actions";
import { formatDate } from "@/features/tickets/format";
import { requirePortalAccess } from "@/server/portal/portal-access";
import { listContactTickets } from "@/server/portal/portal-tickets";

/**
 * Inicio del portal: las solicitudes que radicó esta persona (D2), de la más
 * reciente a la más antigua. Lo que se lista lo decide la consulta, con el
 * contacto del acceso resuelto en servidor.
 */
export default async function PortalHomePage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; bienvenida?: string }>;
}) {
  const access = await requirePortalAccess();
  const params = await searchParams;
  const requested = Number.parseInt(params.pagina ?? "1", 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const { rows, total, pageCount } = await listContactTickets(access, page);

  return (
    <PortalShell title="Mis solicitudes" contactName={access.nombreContacto} clientName={access.nombreCliente} signOutAction={signOutPortalAction}>
      <div className="space-y-4">
        {params.bienvenida === "1" && (
          <p className={notice("success")} role="status">
            Tu acceso quedó activo en este navegador.
          </p>
        )}
        {access.soloLectura && (
          <p className={notice("info")}>Tu acceso es de solo consulta: puedes ver tus solicitudes, pero no radicar nuevas.</p>
        )}

        {!access.soloLectura && (
          <div className="flex justify-end">
            <Link href="/portal/tickets/nuevo" className={buttonRecipe({ variant: "primary" })}>
              <Plus aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
              Nueva solicitud
            </Link>
          </div>
        )}

        <section className={surface({ padded: false })} aria-label="Mis solicitudes">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-ink-muted">Todavía no has radicado solicitudes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.idTicket} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 hover:bg-surface-sunken">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/portal/tickets/${row.idTicket}`}
                      className={cn("rounded-control font-bold text-heading underline-offset-2 hover:underline", focusRing)}
                    >
                      {row.codigoTicket ?? `Solicitud del ${formatDate(row.fechaCreacion)}`}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-ink-muted">{row.descripcion}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TicketStateBadge state={row.estado} />
                    <span className="text-sm tabular-nums text-ink-muted">{formatDate(row.fechaCreacion)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pageCount > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm text-ink-muted">
            <span>
              Página {page} de {pageCount} · {total.toLocaleString("es-CO")} solicitudes
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/portal?pagina=${page - 1}`} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                  Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link href={`/portal?pagina=${page + 1}`} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                  Siguiente
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </PortalShell>
  );
}

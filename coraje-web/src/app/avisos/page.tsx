import Link from "next/link";

import { SegmentedLinks } from "@/design-system/components/SegmentedLinks";
import { NoticeListItem } from "@/design-system/patterns/notice-bell/NoticeListItem";
import { buttonRecipe } from "@/design-system/recipes/button";
import { notice, surface } from "@/design-system/recipes/surface";
import { markAllNoveltiesReadAction, openNoticeAction } from "@/features/avisos/actions";
import { AppFrame } from "@/features/shell/AppFrame";
import { formatDateTime } from "@/features/tickets/format";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { AVISO_ACTIONS } from "@/server/authorization/catalog";
import { isNoticeSection, listNotices, type NoticeSection } from "@/server/notifications/ticket-notices";
import { getModeAccess } from "@/server/tickets/mode-access";
import { modeQuery, parseTicketMode, type TicketMode } from "@/server/tickets/ticket-mode";

/**
 * Avisos de la persona (U15, specs/tickets.md §12), en dos secciones:
 *
 * - «Requiere tu atención»: lo abierto, lo más antiguo primero, porque es lo
 *   que más espera. No se despacha leyendo: sale de aquí cuando se actúa
 *   sobre el ticket.
 * - «Novedades»: lo que solo informa, lo más reciente primero, con «Marcar
 *   todas como leídas».
 *
 * La sección y la página viajan en la URL, como en la bandeja.
 */
const SECTION_LABEL: Record<NoticeSection, string> = {
  atencion: "Requiere tu atención",
  novedades: "Novedades",
};

/** Las secciones y páginas conservan el modo en que se abrió la página (U17). */
function sectionHref(mode: TicketMode, section: NoticeSection, page = 1): string {
  const query = modeQuery(mode);
  query.set("seccion", section);
  if (page > 1) query.set("pagina", String(page));
  return `/avisos?${query.toString()}`;
}

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; seccion?: string; pagina?: string }>;
}) {
  const employee = await requireCurrentEmployee("/avisos");
  const { modo, seccion, pagina } = await searchParams;
  // Los avisos son los mismos en los dos modos (U17): el modo solo dice cómo
  // se dibuja la página, la que tenía quien pulsó «Ver todos».
  const mode: TicketMode = parseTicketMode(modo) === "coraje" && (await getModeAccess(employee.idPersonal)).coraje ? "coraje" : "helpdesk";
  const section: NoticeSection = isNoticeSection(seccion) ? seccion : "atencion";
  const page = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);

  const allowed = await resolveGrant(employee.idPersonal, AVISO_ACTIONS.consultar);
  if (!allowed) {
    return (
      <AppFrame employee={employee} title="Avisos" mode={mode}>
        <p className={notice("warning")}>No tienes permiso para consultar avisos.</p>
      </AppFrame>
    );
  }

  const { items, hasMore, counts } = await listNotices({ idPersonal: employee.idPersonal, section, page });

  return (
    <AppFrame employee={employee} title="Avisos" mode={mode}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedLinks
            label="Secciones de avisos"
            items={[
              {
                label: counts.atencion > 0 ? `${SECTION_LABEL.atencion} (${counts.atencion})` : SECTION_LABEL.atencion,
                href: sectionHref(mode, "atencion"),
                current: section === "atencion",
              },
              {
                label: counts.novedades > 0 ? `${SECTION_LABEL.novedades} (${counts.novedades} sin leer)` : SECTION_LABEL.novedades,
                href: sectionHref(mode, "novedades"),
                current: section === "novedades",
              },
            ]}
          />
          {section === "novedades" && counts.novedades > 0 && (
            <form action={markAllNoveltiesReadAction}>
              <button type="submit" className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                Marcar todas como leídas
              </button>
            </form>
          )}
        </div>

        {section === "atencion" && items.length > 0 && (
          <p className="text-sm text-ink-muted">
            Un pendiente sale de esta lista al responder, rechazar o reasignar el ticket, o cuando el ticket termina. Si
            lleva más de un día hábil sin atenderse, te llega un correo cada día hábil.
          </p>
        )}

        <section className={surface({ padded: false })} aria-label={SECTION_LABEL[section]}>
          {items.length === 0 ? (
            <p className="px-5 py-10 text-center text-ink-muted">
              {section === "atencion" ? "No tienes nada pendiente." : "No tienes novedades."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <NoticeListItem
                  key={item.id}
                  id={item.id}
                  title={item.titulo}
                  detail={item.detalle}
                  meta={formatDateTime(item.fecha)}
                  unread={!item.leido}
                  attention={item.clase === "ATENCION"}
                  action={openNoticeAction}
                />
              ))}
            </ul>
          )}
        </section>

        {section === "novedades" && (page > 1 || hasMore) && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm text-ink-muted">
            <span>Página {page}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={sectionHref(mode, "novedades", page - 1)} className={buttonRecipe({ variant: "secondary", size: "sm" })}>
                  Anterior
                </Link>
              )}
              {hasMore && (
                <Link
                  href={sectionHref(mode, "novedades", page + 1)}
                  className={buttonRecipe({ variant: "secondary", size: "sm" })}
                >
                  Siguiente
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </AppFrame>
  );
}

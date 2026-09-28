import Link from "next/link";
import { notFound } from "next/navigation";

import { focusRing } from "@/design-system/recipes/interaction";
import { notice, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { formatDateTime } from "@/features/tickets/format";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { CLASSIFICATION_PAGE_SIZE, listUnclassified } from "@/server/tickets/classification-queries";

/**
 * Cola de clasificación (T3): lo que los clientes radicaron en el portal y
 * todavía no tiene área. Del más antiguo al más reciente: el plazo del
 * cliente no empieza hasta que se clasifica, así que lo que espera aquí
 * espera sin reloj, y lo más viejo es lo más urgente.
 *
 * Sin `ticket.redirigir`, la ruta responde como si no existiera.
 */

/**
 * Forma de `codigo_ticket` («{codigo_area}-{año}-{consecutivo}»,
 * helpdesk.next_codigo_ticket). El aviso solo repite el parámetro si tiene
 * esa forma: un enlace fabricado no puede poner texto propio en esta
 * pantalla, igual que en `/login`.
 */
const TICKET_CODE = /^[A-Z0-9]{1,10}-\d{4}-\d{4,6}$/;
export default async function ClassificationPage({
  searchParams,
}: {
  searchParams: Promise<{ clasificado?: string; correo?: string }>;
}) {
  const employee = await requireCurrentEmployee("/clasificacion");
  const rows = await listUnclassified(employee.idPersonal);
  if (rows === null) notFound();
  const params = await searchParams;

  return (
    <AppFrame employee={employee} title="Clasificación de tickets de clientes">
      <div className="space-y-4">
        {params.clasificado && (
          <p className={notice("success")} role="status">
            {TICKET_CODE.test(params.clasificado)
              ? `Ticket ${params.clasificado} clasificado y asignado.`
              : "Ticket clasificado y asignado."}
          </p>
        )}
        {params.correo === "fallido" && (
          <p className={notice("warning")}>
            El aviso por correo a la persona responsable no salió. El ticket ya está en su bandeja de «Por atender».
          </p>
        )}

        <section className={surface({ padded: false })} aria-label="Tickets por clasificar">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-ink-muted">No hay tickets de clientes por clasificar.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.idTicket} className="px-5 py-4 hover:bg-surface-sunken">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clasificacion/${row.idTicket}`}
                        className={cn("rounded-control font-bold text-heading underline-offset-2 hover:underline", focusRing)}
                      >
                        {row.cliente}
                      </Link>
                      <p className="text-sm text-ink-muted">{row.contacto}</p>
                      <p className="mt-1 truncate text-base text-ink">{row.descripcion}</p>
                    </div>
                    <span className="text-sm tabular-nums text-ink-muted">{formatDateTime(row.fechaCreacion)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {rows.length === CLASSIFICATION_PAGE_SIZE && (
          <p className="text-sm text-ink-muted">
            Se muestran los {CLASSIFICATION_PAGE_SIZE} más antiguos. Al clasificarlos aparecerán los siguientes.
          </p>
        )}
      </div>
    </AppFrame>
  );
}

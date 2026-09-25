import { Eye, Lock } from "lucide-react";

import { iconStroke } from "@/design-system/foundations/iconography";
import { TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { cn } from "@/design-system/utilities/cn";
import type { TicketHistoryEntry } from "@/server/tickets/ticket-queries";

import { formatDateTime } from "./format";

/**
 * Historia del ticket, en orden cronológico.
 *
 * La distinción entre lo que ve el solicitante y la nota interna es la más
 * cara de equivocar de toda la interfaz (design/sistema-helpdesk.md §6, V7).
 * No se resuelve con un matiz de color. Cada entrada lleva:
 * - un rótulo en texto que dice quién la ve;
 * - un icono distinto (candado / ojo);
 * - una forma distinta: la nota interna va sobre fondo hundido con borde
 *   discontinuo, y lo visible para el solicitante sobre superficie blanca con
 *   borde continuo.
 *
 * La lista ya llega filtrada por visibilidad desde la consulta: quien solo
 * radicó el ticket no recibe las notas internas, ni siquiera ocultas.
 */
const EVENT_TITLE: Record<string, string> = {
  CREACION: "Ticket radicado",
  REDIRECCION: "Redirigido",
  REASIGNACION: "Reasignado",
  RESPUESTA: "Respuesta",
  RECHAZO: "Rechazado",
  COMENTARIO: "Nota",
  MIGRACION_LEGACY: "Traído desde PowerApps",
  SINCRONIZACION_LEGACY: "Cambio registrado en PowerApps",
};

export function TicketHistory({ entries }: { entries: TicketHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-ink-muted">Este ticket todavía no tiene historia visible.</p>;
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const internal = entry.visibilidad === "INTERNO";
        const Icon = internal ? Lock : Eye;
        return (
          <li
            key={entry.idEvento}
            className={cn(
              "rounded-control border px-4 py-3",
              internal ? "border-dashed border-line-strong bg-surface-sunken" : "border-line bg-surface",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="flex items-center gap-2 text-sm">
                <span className="font-bold text-heading">{EVENT_TITLE[entry.tipo] ?? entry.tipo}</span>
                <span className="text-ink-muted">· {entry.esSistema ? "Sistema" : (entry.autor ?? "Persona sin nombre")}</span>
                {entry.estadoNuevo && <TicketStateBadge state={entry.estadoNuevo} />}
              </p>
              <time dateTime={entry.fecha.toISOString()} className="text-sm tabular-nums text-ink-muted">
                {formatDateTime(entry.fecha)}
              </time>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <Icon aria-hidden className="size-3.5" strokeWidth={iconStroke.regular} />
              {internal ? "Nota interna · el solicitante no la ve" : "Visible para el solicitante"}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-base text-ink">{entry.contenido}</p>
          </li>
        );
      })}
    </ol>
  );
}

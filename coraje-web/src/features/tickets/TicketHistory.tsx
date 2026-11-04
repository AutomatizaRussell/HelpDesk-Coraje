import {
  ArrowRightLeft,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  History,
  Lock,
  Plus,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { iconStroke } from "@/design-system/foundations/iconography";
import { TicketStateBadge } from "@/design-system/patterns/ticket-status/TicketStatusBadges";
import { cn } from "@/design-system/utilities/cn";
import { AttachmentLink } from "@/features/attachments/AttachmentLink";
import type { TicketHistoryEntry } from "@/server/tickets/ticket-queries";

import { formatDateTime, personInitials } from "./format";

/**
 * Historia del ticket, con lo más reciente primero (el orden lo da la
 * consulta, `getTicketDetail`): va debajo del cuadro de escritura, y lo
 * último que pasó queda junto a donde se escribe.
 *
 * U31 (maqueta aprobada «U»): cada cosa se distingue por **forma**, no solo
 * por color.
 * - **Eventos** (radicado, reasignado, observadores, aprobaciones…): una línea
 *   pequeña con icono; no son conversación.
 * - **Mensajes visibles** (la respuesta del equipo, el comentario del
 *   solicitante): burbujas con las iniciales de quien escribe; la del equipo,
 *   en navy.
 * - **Nota interna**: ámbar, borde punteado, candado y «el solicitante no la
 *   ve». La distinción entre lo que ve el solicitante y lo que no es la más
 *   cara de equivocar de toda la interfaz (design/sistema-helpdesk.md §6, V7).
 *
 * La lista ya llega filtrada por visibilidad desde la consulta: quien solo
 * radicó el ticket no recibe las notas internas, ni siquiera ocultas. Los
 * adjuntos (U7) van con su evento y heredan su visibilidad; los que tienen
 * vista previa se abren dentro de HelpDesk (`AttachmentLink`, U29).
 */
const EVENT_TITLE: Record<string, string> = {
  CREACION: "Ticket radicado",
  REDIRECCION: "Redirigido",
  REASIGNACION: "Reasignado",
  RESPUESTA: "Respuesta",
  RECHAZO: "Rechazado",
  COMENTARIO: "Nota interna",
  MIGRACION_LEGACY: "Traído desde PowerApps",
  SINCRONIZACION_LEGACY: "Cambio registrado en PowerApps",
  OBSERVADOR_AGREGADO: "Observadores añadidos",
  OBSERVADOR_RETIRADO: "Observador retirado",
  SOLICITUD_VALIDACION: "Aprobación solicitada",
  APROBACION_OTORGADA: "Aprobado",
  APROBACION_DENEGADA: "No aprobado",
  APROBACION_RETIRADA: "Aprobación retirada",
  COMENTARIO_SOLICITANTE: "Comentario del solicitante",
};

/** Los tipos que son conversación: lo demás es un evento de una línea. */
const MESSAGE_TYPES = new Set(["RESPUESTA", "COMENTARIO", "COMENTARIO_SOLICITANTE", "RECHAZO"]);

const EVENT_ICON: Record<string, LucideIcon> = {
  CREACION: Plus,
  REDIRECCION: ArrowRightLeft,
  REASIGNACION: UserCheck,
  OBSERVADOR_AGREGADO: Eye,
  OBSERVADOR_RETIRADO: EyeOff,
  SOLICITUD_VALIDACION: ShieldCheck,
  APROBACION_OTORGADA: CircleCheck,
  APROBACION_DENEGADA: CircleX,
  APROBACION_RETIRADA: CircleX,
  MIGRACION_LEGACY: History,
  SINCRONIZACION_LEGACY: History,
};

function authorOf(entry: TicketHistoryEntry): string {
  return entry.esSistema ? "Sistema" : (entry.autor ?? "Persona sin nombre");
}

function Attachments({ idTicket, entry }: { idTicket: string; entry: TicketHistoryEntry }) {
  if (entry.adjuntos.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1" aria-label="Adjuntos">
      {entry.adjuntos.map((adjunto) => (
        <li key={adjunto.id}>
          <AttachmentLink idTicket={idTicket} id={adjunto.id} nombre={adjunto.nombre} tamanoBytes={adjunto.tamanoBytes} />
        </li>
      ))}
    </ul>
  );
}

function When({ fecha }: { fecha: Date }) {
  return (
    <time dateTime={fecha.toISOString()} className="tabular-nums">
      {formatDateTime(fecha)}
    </time>
  );
}

/** Un evento: icono, quién y qué en una línea, y su detalle debajo si lo tiene. */
function EventLine({ idTicket, entry }: { idTicket: string; entry: TicketHistoryEntry }) {
  const Icon = EVENT_ICON[entry.tipo] ?? History;
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted">
        <Icon className="size-3.5" strokeWidth={iconStroke.regular} />
      </span>
      <div className="min-w-0 pt-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span>
            <span className="font-bold text-ink">{EVENT_TITLE[entry.tipo] ?? entry.tipo}</span> · {authorOf(entry)} · <When fecha={entry.fecha} />
          </span>
          {entry.estadoNuevo && <TicketStateBadge state={entry.estadoNuevo} />}
          {entry.visibilidad === "INTERNO" && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-warning">
              <Lock aria-hidden className="size-3" strokeWidth={iconStroke.regular} />
              Interno
            </span>
          )}
        </p>
        {entry.contenido && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-muted">{entry.contenido}</p>}
        <Attachments idTicket={idTicket} entry={entry} />
      </div>
    </li>
  );
}

/** Un mensaje: burbuja con quién lo escribió y quién lo ve. */
function MessageBubble({ idTicket, entry }: { idTicket: string; entry: TicketHistoryEntry }) {
  const internal = entry.visibilidad === "INTERNO";
  const fromRequester = entry.tipo === "COMENTARIO_SOLICITANTE";
  const author = authorOf(entry);
  return (
    <li className="flex gap-3">
      {internal ? (
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-pill border-2 border-dashed border-warning text-warning"
        >
          <Lock className="size-3.5" strokeWidth={iconStroke.regular} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-pill text-2xs font-black",
            fromRequester ? "bg-avatar-surface text-heading" : "bg-action text-on-action",
          )}
        >
          {personInitials(author)}
        </span>
      )}
      <div className="min-w-0 max-w-2xl flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span>
            {internal ? (
              <span className="font-bold text-warning">Nota interna</span>
            ) : (
              <span className="font-bold text-ink">{author}</span>
            )}
            {internal && <> · {author}</>} · {EVENT_TITLE[entry.tipo] && !internal ? `${EVENT_TITLE[entry.tipo]} · ` : ""}
            <When fecha={entry.fecha} />
          </span>
          {entry.estadoNuevo && <TicketStateBadge state={entry.estadoNuevo} />}
        </p>
        <div
          className={cn(
            "mt-1.5 rounded-card rounded-tl-none px-4 py-3",
            internal
              ? "border-2 border-dashed border-warning bg-warning-surface text-ink"
              : fromRequester
                ? "bg-surface-sunken text-ink"
                : "bg-action text-on-action",
          )}
        >
          <p className="whitespace-pre-wrap break-words text-base">{entry.contenido}</p>
        </div>
        <p className={cn("mt-1 flex items-center gap-1.5 text-xs font-bold", internal ? "text-warning" : "text-ink-muted")}>
          {internal ? <Lock aria-hidden className="size-3" strokeWidth={iconStroke.regular} /> : <Eye aria-hidden className="size-3" strokeWidth={iconStroke.regular} />}
          {internal ? "El solicitante no la ve" : "Visible para el solicitante"}
        </p>
        <Attachments idTicket={idTicket} entry={entry} />
      </div>
    </li>
  );
}

/**
 * Lo que pidió el solicitante al radicar (U32, corte 68), como el primer
 * mensaje de un hilo de correo: su burbuja clara, con sus iniciales y la
 * fecha. Va encima del cuadro de escritura, en la columna principal, porque
 * atender un ticket es releer la petición mientras se escribe la respuesta.
 *
 * Antes iba en la cabecera recortada a tres líneas: al expandirla, la
 * cabecera dejaba de serlo. Una ventana modal se descartó porque tapa el cuadro
 * de escritura justo cuando hay que leer y escribir a la vez.
 */
export function TicketRequest({ author, fecha, text }: { author: string | null; fecha: Date; text: string }) {
  const name = author ?? "Sin solicitante";
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-pill bg-avatar-surface text-2xs font-bold text-heading">
        {author ? personInitials(author) : "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">
          <span className="font-bold text-ink">{name}</span> · Solicitud · <When fecha={fecha} />
        </p>
        <div className="mt-1.5 rounded-card rounded-tl-none bg-surface-sunken px-4 py-3 text-ink">
          <p className="whitespace-pre-wrap break-words text-base">{text}</p>
        </div>
      </div>
    </div>
  );
}

export function TicketHistory({ idTicket, entries }: { idTicket: string; entries: TicketHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-ink-muted">Este ticket todavía no tiene historia visible.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) =>
        MESSAGE_TYPES.has(entry.tipo) && entry.contenido ? (
          <MessageBubble key={entry.idEvento} idTicket={idTicket} entry={entry} />
        ) : (
          <EventLine key={entry.idEvento} idTicket={idTicket} entry={entry} />
        ),
      )}
    </ol>
  );
}

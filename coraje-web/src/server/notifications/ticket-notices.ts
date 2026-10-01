import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
// SUPLANTACIÓN — bloque temporal para pruebas.
import { getCurrentEmployee } from "@/server/auth/current-employee";
// FIN SUPLANTACIÓN

import type { TicketMailKind } from "./ticket-mail-content";
import { describeNotice, type NoticeText } from "./ticket-notice-content";
import { NOTICE_CLASS, isTicketNoticeKind, type NoticeClass, type TicketNoticeKind } from "./ticket-notice-kinds";
import { enqueueTicketMail } from "./ticket-notifications";

/**
 * Avisos del ticket (U15, specs/tickets.md §12): lo que la acción de una
 * persona le cuenta a las demás.
 *
 * - A un **empleado** le llega un aviso a la campana (`helpdesk.ticket_aviso`),
 *   escrito en la misma transacción que el evento. No hay nada que enviar
 *   después del commit, así que un aviso no puede fallar a medias.
 * - Al **contacto de un cliente** le llega un correo, como desde U8
 *   (`ticket-notifications.ts`): el cliente no tiene campana.
 *
 * Los comandos del ticket describen a quién le toca saber (`TicketDelivery`)
 * y este módulo decide por qué canal. Qué cierra un aviso de atención no lo
 * decide nadie aquí: es el trigger `trg_resolver_avisos_ticket` de la base.
 *
 * Todas las lecturas filtran por destinatario: cada persona ve sus avisos y
 * ningún otro. Es lo que significa el alcance `PROPIO` de `aviso.consultar`,
 * que exigen la vista y las acciones antes de llamar aquí.
 */

type Tx = Prisma.TransactionClient;

/** A quién le toca saber de una acción, y qué. */
export type TicketDelivery =
  | { tipo: "EMPLEADO"; kind: TicketNoticeKind; idPersonal: string }
  | { tipo: "CONTACTO"; kind: TicketMailKind; idContacto: string };

/**
 * Registra, dentro de la transacción de la acción, los avisos de los
 * empleados y los correos de los contactos. Omite a quien hizo la acción:
 * nadie necesita que le avisen de lo que acaba de hacer (la base lo exige
 * también, `chk_ticket_aviso_no_propio`).
 *
 * @returns los ids de los correos a contactos, para enviarlos tras el commit.
 */
export async function deliverTicketEvent(
  tx: Tx,
  params: { idTicket: string; idEvento: string; idAutor: string; texto: string | null; deliveries: readonly TicketDelivery[] },
): Promise<string[]> {
  const seen = new Set<string>();
  const notices = params.deliveries.flatMap((delivery) => {
    if (delivery.tipo !== "EMPLEADO" || delivery.idPersonal === params.idAutor) return [];
    const key = `${delivery.idPersonal}:${delivery.kind}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [delivery];
  });

  if (notices.length > 0) {
    // SUPLANTACIÓN — bloque temporal. El autor es la persona suplantada, como
    // en el evento; quien actuó de verdad queda aparte para que un aviso de
    // prueba no se escale por correo a un compañero.
    const idSuplantador = (await getCurrentEmployee())?.suplantacion?.idPersonalReal ?? null;
    // FIN SUPLANTACIÓN
    await tx.ticketAviso.createMany({
      data: notices.map((notice) => ({
        idTicket: params.idTicket,
        idEvento: params.idEvento,
        idDestinatario: notice.idPersonal,
        idAutor: params.idAutor,
        tipo: notice.kind,
        clase: NOTICE_CLASS[notice.kind],
        idSuplantador,
      })),
    });
  }

  const contacts = params.deliveries.flatMap((delivery) =>
    delivery.tipo === "CONTACTO" ? [{ kind: delivery.kind, idContacto: delivery.idContacto }] : [],
  );
  if (contacts.length === 0) return [];
  return enqueueTicketMail(tx, {
    idTicket: params.idTicket,
    idEvento: params.idEvento,
    idRemitente: params.idAutor,
    texto: params.texto,
    deliveries: contacts,
  });
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type NoticeSection = "atencion" | "novedades";

export const NOTICE_SECTIONS: readonly NoticeSection[] = ["atencion", "novedades"];

export function isNoticeSection(value: unknown): value is NoticeSection {
  return typeof value === "string" && (NOTICE_SECTIONS as readonly string[]).includes(value);
}

export interface NoticeItem extends NoticeText {
  id: string;
  idTicket: string;
  clase: NoticeClass;
  fecha: Date;
  leido: boolean;
}

/** Lo que muestra la campana al abrirse: pocos, lo justo para decidir. */
export const BELL_LIMIT = 8;

/** Página de la lista de novedades. */
export const NOTICES_PAGE_SIZE = 30;

/**
 * Un pendiente de atención se lista entero: son pocos por definición (lo que
 * espera a una persona), y cortarlo escondería trabajo. El tope solo protege
 * de un caso patológico.
 */
const ATTENTION_MAX = 200;

const NOTICE_SELECT = {
  id: true,
  idTicket: true,
  tipo: true,
  clase: true,
  createdAt: true,
  leidoAt: true,
  factTicket: { select: { codigoTicket: true, descripcionProblema: true } },
  evento: { select: { contenido: true } },
  autor: { select: { nombreCompleto: true } },
} satisfies Prisma.TicketAvisoSelect;

type NoticeRow = Prisma.TicketAvisoGetPayload<{ select: typeof NOTICE_SELECT }>;

function toItem(row: NoticeRow): NoticeItem | null {
  // El CHECK de la tabla impide otro tipo; si apareciera (un despliegue a
  // medias), no se inventa un texto para él.
  if (!isTicketNoticeKind(row.tipo)) return null;
  const text = describeNotice(row.tipo, {
    codigo: row.factTicket.codigoTicket,
    autor: row.autor.nombreCompleto,
    descripcion: row.factTicket.descripcionProblema,
    textoEvento: row.evento.contenido,
  });
  return {
    id: row.id,
    idTicket: row.idTicket,
    clase: NOTICE_CLASS[row.tipo],
    fecha: row.createdAt,
    leido: row.leidoAt !== null,
    ...text,
  };
}

function toItems(rows: readonly NoticeRow[]): NoticeItem[] {
  return rows.flatMap((row) => toItem(row) ?? []);
}

const openAttentionWhere = (idPersonal: string) =>
  ({ idDestinatario: idPersonal, clase: "ATENCION", resueltoAt: null }) satisfies Prisma.TicketAvisoWhereInput;

const unreadNoveltyWhere = (idPersonal: string) =>
  ({ idDestinatario: idPersonal, clase: "NOVEDAD", leidoAt: null }) satisfies Prisma.TicketAvisoWhereInput;

/**
 * El número de la campana: **pendientes abiertos más novedades sin leer**.
 *
 * Corregido el 01-oct-2026 tras probarlo: antes contaba solo lo no leído, y
 * abrir un ticket marca sus avisos como leídos. Un pendiente seguía abierto
 * —sin atender— y la campana no lo contaba. Un pendiente cuenta hasta que se
 * actúa, se haya visto o no; una novedad, hasta que se lee.
 *
 * Dos conteos sobre índices parciales (`ix_ticket_aviso_atencion_abierta` y
 * `ix_ticket_aviso_no_leido`), en cada página del shell. No hay sondeo: el
 * número se actualiza al navegar.
 */
export async function countBellNotices(idPersonal: string): Promise<number> {
  const [atencion, novedades] = await Promise.all([
    prisma.ticketAviso.count({ where: openAttentionWhere(idPersonal) }),
    prisma.ticketAviso.count({ where: unreadNoveltyWhere(idPersonal) }),
  ]);
  return atencion + novedades;
}

/**
 * Lo que muestra la campana al abrirla: primero lo que pide atención, después
 * las novedades sin leer, hasta `BELL_LIMIT`. `total` es el mismo número que
 * `countBellNotices`.
 */
export async function listBellNotices(idPersonal: string): Promise<{ items: NoticeItem[]; atencion: number; total: number }> {
  const [atencionRows, novedadRows, atencion, novedadesSinLeer] = await Promise.all([
    prisma.ticketAviso.findMany({
      where: openAttentionWhere(idPersonal),
      orderBy: { createdAt: "desc" },
      take: BELL_LIMIT,
      select: NOTICE_SELECT,
    }),
    prisma.ticketAviso.findMany({
      where: unreadNoveltyWhere(idPersonal),
      orderBy: { createdAt: "desc" },
      take: BELL_LIMIT,
      select: NOTICE_SELECT,
    }),
    prisma.ticketAviso.count({ where: openAttentionWhere(idPersonal) }),
    prisma.ticketAviso.count({ where: unreadNoveltyWhere(idPersonal) }),
  ]);
  return {
    items: toItems([...atencionRows, ...novedadRows].slice(0, BELL_LIMIT)),
    atencion,
    total: atencion + novedadesSinLeer,
  };
}

/** Una sección de la página de avisos. */
export async function listNotices(params: {
  idPersonal: string;
  section: NoticeSection;
  page: number;
}): Promise<{ items: NoticeItem[]; hasMore: boolean; counts: Record<NoticeSection, number> }> {
  const page = Math.max(1, Math.floor(params.page));
  const [rows, atencion, novedadesSinLeer] = await Promise.all([
    params.section === "atencion"
      ? prisma.ticketAviso.findMany({
          where: openAttentionWhere(params.idPersonal),
          orderBy: { createdAt: "asc" },
          take: ATTENTION_MAX,
          select: NOTICE_SELECT,
        })
      : prisma.ticketAviso.findMany({
          where: { idDestinatario: params.idPersonal, clase: "NOVEDAD" },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * NOTICES_PAGE_SIZE,
          // Uno de más para saber si hay otra página sin contarlas todas.
          take: NOTICES_PAGE_SIZE + 1,
          select: NOTICE_SELECT,
        }),
    prisma.ticketAviso.count({ where: openAttentionWhere(params.idPersonal) }),
    prisma.ticketAviso.count({ where: { idDestinatario: params.idPersonal, clase: "NOVEDAD", leidoAt: null } }),
  ]);
  const hasMore = params.section === "novedades" && rows.length > NOTICES_PAGE_SIZE;
  return {
    items: toItems(hasMore ? rows.slice(0, NOTICES_PAGE_SIZE) : rows),
    hasMore,
    counts: { atencion, novedades: novedadesSinLeer },
  };
}

// ---------------------------------------------------------------------------
// Marcar como leído
// ---------------------------------------------------------------------------

/**
 * Abre un aviso: lo marca leído y dice a qué ticket lleva. Un aviso de otra
 * persona no existe para quien lo pide (`null`), igual que uno inexistente.
 * Leer un aviso de atención no lo cierra: sigue en «Requiere tu atención».
 */
export async function openNotice(params: { idPersonal: string; idAviso: string }): Promise<string | null> {
  const aviso = await prisma.ticketAviso.findFirst({
    where: { id: params.idAviso, idDestinatario: params.idPersonal },
    select: { idTicket: true, leidoAt: true },
  });
  if (!aviso) return null;
  if (!aviso.leidoAt) {
    await prisma.ticketAviso.updateMany({
      where: { id: params.idAviso, idDestinatario: params.idPersonal, leidoAt: null },
      data: { leidoAt: new Date() },
    });
  }
  return aviso.idTicket;
}

/**
 * Abrir un ticket marca leídos los avisos que la persona tenía de él: ya vio
 * lo que decían. Lo llama el detalle del ticket, llegue la persona por la
 * campana, por la bandeja o por un enlace.
 */
export async function markTicketNoticesRead(params: { idPersonal: string; idTicket: string }): Promise<void> {
  await prisma.ticketAviso.updateMany({
    where: { idDestinatario: params.idPersonal, idTicket: params.idTicket, leidoAt: null },
    data: { leidoAt: new Date() },
  });
}

/** «Marcar todas como leídas», solo sobre las novedades: la atención no se despacha leyendo. */
export async function markAllNoveltiesRead(idPersonal: string): Promise<number> {
  const result = await prisma.ticketAviso.updateMany({
    where: { idDestinatario: idPersonal, clase: "NOVEDAD", leidoAt: null },
    data: { leidoAt: new Date() },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Para el escalamiento
// ---------------------------------------------------------------------------

/** Avisos concretos de una persona, por id, en el orden pedido. */
export async function loadNoticesByIds(idPersonal: string, ids: readonly string[]): Promise<NoticeItem[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.ticketAviso.findMany({
    where: { id: { in: [...ids] }, idDestinatario: idPersonal },
    select: NOTICE_SELECT,
  });
  const byId = new Map(toItems(rows).map((item) => [item.id, item]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

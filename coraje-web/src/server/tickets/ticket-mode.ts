import type { Prisma } from "@/generated/prisma/client";

/**
 * Los dos modos de la aplicación: **Interno**, el trabajo entre empleados, y
 * **Externo**, el trabajo con clientes. Funcionan como el modo claro y el
 * oscuro: la misma bandeja y el mismo detalle, con otros tickets y otro color.
 * Nacieron en U17 (01-oct-2026) como «HelpDesk» y «Coraje»; el 13-oct-2026 el
 * usuario los renombró al desconectar el portal de clientes (U20), porque
 * Externo ya no depende del portal: en PowerApps los tickets de cliente los
 * radica un empleado.
 *
 * La frontera es una columna, no una regla nueva: un ticket es de cliente si
 * tiene `id_cliente_contai`. `chk_fact_ticket_origen_exclusivo` exige cliente
 * **o** solicitante interno, nunca ambos (tickets.md §7.1), así que cada
 * ticket cae en un modo y solo en uno, sea del portal o legacy de SharePoint.
 *
 * El modo **no es un permiso**: no amplía ni recorta el alcance de consulta.
 * Es un filtro más que se combina con AND con el alcance, igual que la vista
 * de la bandeja. Quién ve el interruptor lo decide `mode-access.ts`.
 */
export const TICKET_MODES = ["interno", "externo"] as const;
export type TicketMode = (typeof TICKET_MODES)[number];

/** Nombre visible de cada modo. */
export const TICKET_MODE_LABEL: Record<TicketMode, string> = {
  interno: "Interno",
  externo: "Externo",
};

/**
 * El modo pedido en la URL (`?modo=externo`). Cualquier otro valor, o ninguno,
 * es Interno: un parámetro fabricado no lleva a ningún sitio raro. Un enlace
 * viejo con `?modo=coraje` abre Interno; el ticket enlazado se sigue abriendo
 * en su modo, que sale del ticket y no de la URL.
 */
export function parseTicketMode(value: string | undefined): TicketMode {
  return value === "externo" ? "externo" : "interno";
}

/** El modo al que pertenece un ticket: el de cliente si tiene cliente. */
export function ticketModeOf(idClienteContai: string | null): TicketMode {
  return idClienteContai === null ? "interno" : "externo";
}

/** El filtro de la base para los tickets de un modo. */
export function modeCondition(mode: TicketMode): Prisma.FactTicketWhereInput {
  return mode === "externo" ? { idClienteContai: { not: null } } : { idClienteContai: null };
}

/**
 * El parámetro de modo de una URL. Interno no lleva ninguno: es la
 * aplicación de siempre, y sus enlaces de antes siguen valiendo.
 */
export function modeQuery(mode: TicketMode): URLSearchParams {
  return new URLSearchParams(mode === "externo" ? { modo: "externo" } : {});
}

/** La bandeja de un modo, en una vista si se pide (`redirigir`, `pendientes`…). */
export function inboxPath(mode: TicketMode, view?: string): string {
  const query = modeQuery(mode);
  if (view) query.set("vista", view);
  const search = query.toString();
  return search ? `/tickets?${search}` : "/tickets";
}

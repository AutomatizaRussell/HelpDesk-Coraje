import { ModeSwitch } from "@/design-system/patterns/mode-switch/ModeSwitch";
import { countModePending, getModeAccess } from "@/server/tickets/mode-access";
import { TICKET_MODES, TICKET_MODE_LABEL, inboxPath, type TicketMode } from "@/server/tickets/ticket-mode";

/**
 * El interruptor Interno/Externo de la bandeja (U17), junto a sus vistas.
 *
 * U32 (04-nov-2026): antes iba al final de la fila de secciones, en todas las
 * páginas. Esa fila desapareció, y el interruptor solo cambia algo en la
 * bandeja —el detalle abre en el modo de su ticket y los avisos son los mismos
 * en los dos—, así que vive aquí.
 *
 * Aparece solo para quien tiene trabajo con clientes (`getModeAccess`, cacheado
 * por petición: el marco ya lo consultó), y el modo que no está abierto lleva
 * el número de lo que espera allí: cambiar de modo no puede esconder trabajo.
 */
export async function InboxModeSwitch({ idPersonal, mode }: { idPersonal: string; mode: TicketMode }) {
  const access = await getModeAccess(idPersonal);
  if (!access.externo) return null;

  const otherMode: TicketMode = mode === "externo" ? "interno" : "externo";
  const otherPending = await countModePending(idPersonal, otherMode);
  return (
    <ModeSwitch
      items={TICKET_MODES.map((item) => ({
        label: TICKET_MODE_LABEL[item],
        href: inboxPath(item),
        current: item === mode,
        pending: item === otherMode ? otherPending : 0,
      }))}
    />
  );
}

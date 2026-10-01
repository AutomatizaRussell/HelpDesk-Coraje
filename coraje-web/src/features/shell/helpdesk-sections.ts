import type { ModuleNavItem } from "@/design-system/patterns/module-nav/ModuleNav";
import { inboxPath, type TicketMode } from "@/server/tickets/ticket-mode";

/**
 * Secciones de HelpDesk en su navegación propia (`ModuleNav`), en orden y por
 * modo (U17).
 *
 * Cada sección se añade aquí cuando su vista existe, no antes: una pestaña que
 * lleva a una pantalla vacía le promete a la persona algo que la aplicación no
 * hace. La bandeja cubre también el detalle y la creación (`/tickets/…`) y,
 * en Coraje, la redirección de un ticket del portal (`/redirigir/…`).
 *
 * Cada modo muestra lo suyo: la salud de la aplicación es trabajo interno; los
 * accesos de clientes, trabajo con clientes. Los tickets por redirigir no son
 * una sección: son una vista de la bandeja de Coraje.
 *
 * Las secciones que dependen de un permiso reciben la decisión ya tomada por
 * el autorizador (`AppFrame` pregunta por la acción), nunca un rol. Ocultar
 * la pestaña es solo presentación: cada vista y cada acción vuelve a exigir
 * su permiso en servidor.
 */
export interface SectionGrants {
  /** `portal.acceso.administrar`: contactos e invitaciones de clientes. */
  administrarAccesos: boolean;
  /** `salud.consultar`: la revisión de salud de la aplicación (U10). */
  consultarSalud: boolean;
}

export function helpdeskSections(mode: TicketMode, grants: SectionGrants): readonly ModuleNavItem[] {
  if (mode === "coraje") {
    return [
      { label: "Tickets", href: inboxPath("coraje"), activePaths: ["/tickets", "/redirigir"] },
      ...(grants.administrarAccesos ? [{ label: "Accesos de clientes", href: "/accesos" }] : []),
    ];
  }
  return [
    { label: "Tickets", href: inboxPath("helpdesk") },
    ...(grants.consultarSalud ? [{ label: "Salud", href: "/salud" }] : []),
  ];
}

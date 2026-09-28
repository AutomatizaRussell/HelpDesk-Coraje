import type { ModuleNavItem } from "@/design-system/patterns/module-nav/ModuleNav";

/**
 * Secciones de HelpDesk en su navegación propia (`ModuleNav`), en orden.
 *
 * Cada sección se añade aquí cuando su vista existe, no antes: una pestaña que
 * lleva a una pantalla vacía le promete a la persona algo que la aplicación no
 * hace. La bandeja cubre también el detalle y la creación (`/tickets/…`).
 *
 * Las secciones que dependen de un permiso reciben la decisión ya tomada por
 * el autorizador (`AppFrame` pregunta por la acción), nunca un rol. Ocultar
 * la pestaña es solo presentación: cada vista y cada acción vuelve a exigir
 * su permiso en servidor.
 */
export interface SectionGrants {
  /** `ticket.redirigir`: la cola de tickets del portal por clasificar (T3). */
  clasificar: boolean;
  /** `portal.acceso.administrar`: contactos e invitaciones de clientes. */
  administrarAccesos: boolean;
}

export function helpdeskSections(grants: SectionGrants): readonly ModuleNavItem[] {
  return [
    { label: "Tickets", href: "/tickets" },
    ...(grants.clasificar ? [{ label: "Clasificación", href: "/clasificacion" }] : []),
    ...(grants.administrarAccesos ? [{ label: "Accesos de clientes", href: "/accesos" }] : []),
  ];
}

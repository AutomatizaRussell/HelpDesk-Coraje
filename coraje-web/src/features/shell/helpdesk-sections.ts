import type { ModuleNavItem } from "@/design-system/patterns/module-nav/ModuleNav";

/**
 * Secciones de HelpDesk en su navegación propia (`ModuleNav`), en orden.
 *
 * Hoy solo existe «Inicio». Cada sección nueva se añade aquí cuando su vista
 * exista —la bandeja llega con U7—, no antes: una pestaña que lleva a una
 * pantalla vacía le promete a la persona algo que la aplicación no hace.
 *
 * Cuando una sección dependa de un permiso, se filtrará con el autorizador
 * ejecutable (specs/permisos.md), nunca comparando roles aquí.
 */
export const HELPDESK_SECTIONS: readonly ModuleNavItem[] = [{ label: "Inicio", href: "/" }];

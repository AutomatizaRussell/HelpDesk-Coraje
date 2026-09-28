/**
 * Vocabulario de la revisión de salud (U10, docs/specs/observabilidad.md §3).
 *
 * Este archivo **no** decide cuándo algo está mal: los umbrales viven solo en
 * la base (`helpdesk.salud_hallazgos` y `helpdesk.registrar_revision_salud`,
 * migración `20260928130000_observabilidad`). Aquí se nombra cada chequeo,
 * de qué señal del inventario sale y de dónde se lee, para que la vista los
 * presente y para que una prueba (`health-checks.contract.test.mts`) exija
 * que cada señal S1-S9 tenga chequeo en la base y que la base no tenga
 * chequeos que la aplicación no conoce.
 */

/**
 * - `CRITICO`: dejó de funcionar para personas que están trabajando y no se
 *   arregla solo. Es lo único que llega a Teams, y solo cuando aparece o
 *   empeora (decisión del usuario del 28-sep-2026: «lo mínimo»).
 * - `ATENCION`: hay que mirarlo, pero no es urgente o se arregla solo.
 * - `AVISO`: contexto, no un defecto.
 */
export const HEALTH_SEVERITIES = ["CRITICO", "ATENCION", "AVISO"] as const;

export type HealthSeverity = (typeof HEALTH_SEVERITIES)[number];

export function isHealthSeverity(value: string): value is HealthSeverity {
  return (HEALTH_SEVERITIES as readonly string[]).includes(value);
}

/**
 * De dónde se lee cada chequeo:
 * - `VIVO`: `helpdesk.salud_hallazgos()`, que la vista consulta en cada
 *   carga; solo necesita la base de HelpDesk.
 * - `DIARIA`: solo lo calcula la revisión diaria, porque necesita la lista
 *   de ítems de HelpDeskBd que n8n pide a SharePoint y la zona staging, que
 *   la aplicación no ve. La vista muestra el de la última revisión, con su
 *   fecha.
 */
export type HealthSource = "VIVO" | "DIARIA";

export interface HealthCheckDefinition {
  /** Señal del inventario de plan-ejecucion.md (U10), o la propia revisión. */
  senal: string;
  severidad: HealthSeverity;
  origen: HealthSource;
  /** Nombre corto para la persona. El detalle con cifras lo da la base. */
  titulo: string;
}

export const HEALTH_CHECKS = {
  espejo_detenido: { senal: "S1", severidad: "CRITICO", origen: "VIVO", titulo: "Envíos a PowerApps detenidos" },
  conflicto_sin_resolver: { senal: "S2", severidad: "ATENCION", origen: "VIVO", titulo: "Conflictos con PowerApps sin resolver" },
  creacion_perdida: { senal: "S3", severidad: "CRITICO", origen: "VIVO", titulo: "Tickets sin ítem en PowerApps" },
  divergencia_sin_revisar: { senal: "S4", severidad: "ATENCION", origen: "VIVO", titulo: "Cambios de PowerApps rechazados sin revisar" },
  correo_fallido: { senal: "S5", severidad: "ATENCION", origen: "VIVO", titulo: "Correos del ticket fallidos" },
  correo_atascado: { senal: "S5", severidad: "ATENCION", origen: "VIVO", titulo: "Correos del ticket a medio enviar" },
  autorizacion_revocada: { senal: "S6", severidad: "ATENCION", origen: "VIVO", titulo: "Autorización de correo revocada" },
  sin_autorizacion: { senal: "S6", severidad: "AVISO", origen: "VIVO", titulo: "Personas que aún no autorizan el correo" },
  envio_portal_fallido: { senal: "S7", severidad: "CRITICO", origen: "VIVO", titulo: "Invitaciones o códigos del portal sin enviar" },
  legacy_sin_inicio: { senal: "S8", severidad: "ATENCION", origen: "VIVO", titulo: "Tickets de PowerApps sin evento de inicio" },
  proyeccion_desfasada: { senal: "S8", severidad: "ATENCION", origen: "VIVO", titulo: "Estado distinto del último evento" },
  legacy_sin_tipo: { senal: "S8", severidad: "AVISO", origen: "VIVO", titulo: "Tickets de PowerApps sin tipo reconocido" },
  items_sin_ingerir: { senal: "S9", severidad: "CRITICO", origen: "DIARIA", titulo: "Ítems de HelpDeskBd que la ingesta no trajo" },
  items_sin_ticket: { senal: "S9", severidad: "ATENCION", origen: "DIARIA", titulo: "Ítems de HelpDeskBd sin ticket" },
  items_borrados: { senal: "S9", severidad: "AVISO", origen: "DIARIA", titulo: "Ítems borrados en PowerApps" },
  reconciliacion_sin_datos: { senal: "S9", severidad: "ATENCION", origen: "DIARIA", titulo: "Reconciliación sin datos de SharePoint" },
  revision_ausente: { senal: "REVISION", severidad: "ATENCION", origen: "VIVO", titulo: "La revisión diaria no corrió" },
} as const satisfies Record<string, HealthCheckDefinition>;

export type HealthCheckCode = keyof typeof HEALTH_CHECKS;

export function isHealthCheckCode(value: string): value is HealthCheckCode {
  return Object.hasOwn(HEALTH_CHECKS, value);
}

/** Chequeos que solo la revisión diaria calcula. */
export const DAILY_ONLY_CHECKS: readonly HealthCheckCode[] = (Object.keys(HEALTH_CHECKS) as HealthCheckCode[]).filter(
  (code) => HEALTH_CHECKS[code].origen === "DIARIA",
);

/** Orden de presentación: lo grave primero, y dentro de cada gravedad, por señal. */
export function compareFindings(a: { severidad: HealthSeverity; senal: string }, b: { severidad: HealthSeverity; senal: string }): number {
  const bySeverity = HEALTH_SEVERITIES.indexOf(a.severidad) - HEALTH_SEVERITIES.indexOf(b.severidad);
  return bySeverity !== 0 ? bySeverity : a.senal.localeCompare(b.senal, "es", { numeric: true });
}

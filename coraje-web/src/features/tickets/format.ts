/**
 * Formato de fechas de tickets, siempre en hora de Bogotá: el plazo se calcula
 * en días hábiles colombianos (`helpdesk.crear_ticket_interno`) y mostrarlo en
 * la zona del servidor —UTC en el contenedor— correría el día de vencimiento.
 */
const dateTime = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnly = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
});

export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

export function formatDate(value: Date): string {
  return dateOnly.format(value);
}

/**
 * Mayúscula inicial para los nombres del catálogo de tipos y categorías
 * («recursos humanos» → «Recursos humanos»). En la base viven en minúsculas
 * porque la ingesta los normaliza para emparejarlos con SharePoint
 * (`core.norm_text`); cambiar el dato rompería ese emparejamiento, así que se
 * corrige al mostrar. Solo la primera letra: una sigla en medio («proyectos y
 * ti») no se puede adivinar y queda como está.
 */
export function formatCatalogLabel(value: string): string {
  return value.charAt(0).toLocaleUpperCase("es-CO") + value.slice(1);
}

/**
 * Iniciales de una persona para su círculo (U30): primera letra de las dos
 * primeras palabras, en mayúscula. «Andrés Ríos» → «AR»; «MATEO» → «M». Los
 * nombres llegan del directorio con mayúsculas o sin ellas: no importa.
 */
export function personInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("es-CO"))
    .join("");
}

/** Rótulo de prioridad con su plazo, igual que en el legacy («Media (3 días)»). */
export function formatPriority(nombre: string, diasSla?: number): string {
  const label = nombre.charAt(0) + nombre.slice(1).toLowerCase();
  return diasSla === undefined ? label : `${label} · ${diasSla} días hábiles`;
}

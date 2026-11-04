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

/**
 * El día de vencimiento de las tarjetas de prioridad (U31): «2026-11-09» →
 * «lun 9 de nov». Llega como fecha sin hora (`AAAA-MM-DD`, ya en Bogotá), así
 * que se formatea en UTC: en la zona del navegador, la medianoche de un día
 * puede caer en el anterior.
 */
const dueDay = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export function formatDueDay(isoDate: string): string {
  return dueDay
    .format(new Date(`${isoDate}T00:00:00Z`))
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rótulo de prioridad con su plazo, igual que en el legacy («Media (3 días)»). */
export function formatPriority(nombre: string, diasSla?: number): string {
  const label = nombre.charAt(0) + nombre.slice(1).toLowerCase();
  return diasSla === undefined ? label : `${label} · ${diasSla} días hábiles`;
}

/**
 * Fecha corta de la cabecera del detalle (U32): «12 ene 2024». La de
 * `formatDate` («12/01/2024») y la larga con «p. m.» partían las cajas en
 * tres líneas. Se arma por partes porque `es-CO` añade un punto al mes
 * abreviado («ene.») según la versión de ICU.
 */
const shortParts = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function shortPieces(value: Date): Record<"day" | "month" | "year" | "hour" | "minute", string> {
  const parts = Object.fromEntries(shortParts.formatToParts(value).map((part) => [part.type, part.value]));
  return {
    day: parts.day ?? "",
    month: (parts.month ?? "").replace(/\./g, ""),
    year: parts.year ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
  };
}

export function formatShortDate(value: Date): string {
  const { day, month, year } = shortPieces(value);
  return `${day} ${month} ${year}`;
}

/** «12 ene 2024 · 12:08», en reloj de 24 horas. */
export function formatShortDateTime(value: Date): string {
  const { hour, minute } = shortPieces(value);
  return `${formatShortDate(value)} · ${hour}:${minute}`;
}

/** Partículas que van en minúscula dentro de un nombre («María de la Cruz»). */
const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

/**
 * Nombre de una persona en tipo oración (U32): el directorio los guarda en
 * mayúsculas («MARY JULIETH RIVERA GUEVARA»), que sobre la cabecera pesaban
 * más que el código del ticket. Se corrige al mostrar, no en el dato, como
 * los nombres de área (`areaDisplayName`).
 */
export function personDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es-CO");
      if (index > 0 && NAME_PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("es-CO") + lower.slice(1);
    })
    .join(" ");
}

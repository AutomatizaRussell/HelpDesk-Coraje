/**
 * Saludo de la cabecera del área (U30): «Buenas tardes, Andrés» y la fecha
 * del día. Todo en hora de Bogotá, como las fechas de los tickets
 * (`features/tickets/format.ts`): el servidor corre en UTC, y a las 7 p. m.
 * en Bogotá ya es medianoche allí, así que diría «Buenos días» y la fecha de
 * mañana.
 */
const TIME_ZONE = "America/Bogota";

const hourFormat = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" });
const longDate = new Intl.DateTimeFormat("es-CO", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/** «Buenos días» hasta el mediodía, «Buenas tardes» hasta las 7 p. m. y «Buenas noches» después. */
export function greetingFor(now: Date): string {
  const hour = Number.parseInt(hourFormat.format(now), 10);
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Primer nombre para el saludo, con mayúscula inicial y el resto en
 * minúscula: el directorio puede guardar «DANIEL FELIPE LOPERA», y saludar a
 * gritos no es saludar. «Andrés Ríos» → «Andrés».
 */
export function greetingName(nombreCompleto: string): string {
  const first = nombreCompleto.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toLocaleUpperCase("es-CO") + first.slice(1).toLocaleLowerCase("es-CO");
}

/** «Martes 3 de noviembre». */
export function longDateLabel(now: Date): string {
  const text = longDate.format(now).replace(",", "");
  return text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1);
}

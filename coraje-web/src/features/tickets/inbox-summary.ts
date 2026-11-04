/**
 * La frase de la cabecera de la bandeja (U30): cómo está el plazo en el
 * alcance de la persona, en una línea.
 *
 * Dice «en tu alcance» y no «tienes» porque los conteos son de todo lo que la
 * persona puede consultar (`countInbox`), no solo de lo asignado a ella: a
 * quien ve un área entera, «tienes 40 vencidos» le atribuiría trabajo ajeno.
 *
 * Devuelve trozos para que la vista resalte los vencidos sin armar HTML: un
 * trozo `alert` es lo único de la frase que pide hacer algo ya.
 */
export type SummaryPart = { text: string; alert?: boolean };

function count(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? singular : plural}`;
}

export function inboxSummary(vencidos: number, porVencer: number): SummaryPart[] {
  const dueSoon = count(porVencer, "por vencer en menos de un día", "por vencer en menos de un día");
  if (vencidos > 0 && porVencer > 0) {
    return [{ text: "En tu alcance hay " }, { text: count(vencidos, "ticket vencido", "tickets vencidos"), alert: true }, { text: ` y ${dueSoon}.` }];
  }
  if (vencidos > 0) {
    return [{ text: "En tu alcance hay " }, { text: count(vencidos, "ticket vencido", "tickets vencidos"), alert: true }, { text: "." }];
  }
  if (porVencer > 0) {
    return [{ text: `Nada vencido en tu alcance; ${count(porVencer, "ticket", "tickets")} por vencer en menos de un día.` }];
  }
  return [{ text: "Nada vencido ni por vencer en tu alcance." }];
}

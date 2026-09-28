import { randomUUID } from "node:crypto";

import type { z } from "zod";

import type { TicketFormState } from "@/features/tickets/action-state";
import { logEvent } from "@/server/observability/log";

/**
 * Ayudantes comunes a toda acción de formulario (tickets, clasificación,
 * accesos, portal). Viven fuera de los archivos de acciones de servidor
 * porque esos archivos solo pueden exportar funciones asíncronas —cada export
 * es un endpoint—, y estos no deben serlo.
 *
 * La forma de la respuesta es `TicketFormState`: nació para los tickets, pero
 * no dice nada de tickets, y una sola forma evita que cada formulario invente
 * la suya.
 */

/** Campos de texto del formulario tal como llegaron, para devolverlos si falla. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Respuesta de validación fallida: un mensaje por campo, y lo escrito intacto. */
export function invalidForm(error: z.ZodError, formData: FormData): TicketFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { status: "error", message: "Revisa los campos marcados.", fieldErrors, values: formValues(formData) };
}

/** Error con un mensaje ya apto para la persona. */
export function errorForm(message: string, formData: FormData): TicketFormState {
  return { status: "error", message, fieldErrors: {}, values: formValues(formData) };
}

/**
 * Error inesperado: se registra con su contexto y se responde con una frase
 * genérica, sin describir el interior de la aplicación.
 */
export function unexpectedForm(error: unknown, formData: FormData, context: string): TicketFormState {
  const idTicket = formData.get("idTicket");
  logEvent("error", "formulario.accion_fallida", { accion: context, idTicket: typeof idTicket === "string" ? idTicket : undefined }, error);
  return errorForm("No fue posible completar la acción. Intenta de nuevo en unos minutos.", formData);
}

export function successForm(message: string, warning?: string): TicketFormState {
  return { status: "success", message, nonce: randomUUID(), warning };
}

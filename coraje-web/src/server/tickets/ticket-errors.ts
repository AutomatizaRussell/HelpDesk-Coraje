/**
 * Errores de dominio del ciclo del ticket. El `message` está escrito para la
 * persona que actúa y se puede mostrar tal cual; el `code` es para el código
 * y para los registros del servidor.
 *
 * Cualquier otro error (red, base caída, un fallo que no esperábamos) no es un
 * `TicketDomainError`: la acción lo registra y responde con un mensaje
 * genérico, para no describirle el interior de la aplicación a nadie.
 */
export type TicketErrorCode =
  | "NO_AUTORIZADO"
  | "TICKET_NO_EXISTE"
  | "TICKET_LEGACY"
  | "ESTADO_NO_PERMITE"
  | "DESTINO_INVALIDO"
  | "SIN_RESPONSABLE"
  | "RESPONSABLE_INACTIVO"
  | "RESPONSABLE_SIN_ACCESO";

export class TicketDomainError extends Error {
  readonly code: TicketErrorCode;

  constructor(code: TicketErrorCode, message: string) {
    super(message);
    this.name = "TicketDomainError";
    this.code = code;
  }
}

export function isTicketDomainError(error: unknown): error is TicketDomainError {
  return error instanceof TicketDomainError;
}

/**
 * Traduce los fallos con nombre de `helpdesk.calificar_ticket` y de la rama
 * `CALIFICACION` del escritor único (U34). El comando ya comprueba casi todo
 * antes con mensaje propio; esto cubre lo que solo la base ve, como dos
 * calificaciones simultáneas del mismo ticket.
 */
export function translateRatingFailure(error: unknown): TicketDomainError | null {
  const message = error instanceof Error ? error.message : String(error);
  // El índice parcial salta con su nombre, sin prefijo HD_.
  if (message.includes("HD_YA_CALIFICADO") || message.includes("ux_fact_ticket_evento_calificacion")) {
    return new TicketDomainError("ESTADO_NO_PERMITE", "Este ticket ya tiene calificación.");
  }
  if (message.includes("HD_CALIFICACION_SIN_COMENTARIO")) {
    return new TicketDomainError("DESTINO_INVALIDO", "Con 1 o 2 estrellas, escribe qué faltó.");
  }
  if (message.includes("HD_CALIFICACION_FUERA_DE_RANGO")) {
    return new TicketDomainError("DESTINO_INVALIDO", "Elige de 1 a 5 estrellas.");
  }
  if (message.includes("HD_CALIFICACION_NO_SOLICITANTE")) {
    return new TicketDomainError("NO_AUTORIZADO", "Solo quien radicó el ticket puede calificarlo.");
  }
  if (message.includes("HD_CALIFICACION_NO_CERRADO")) {
    return new TicketDomainError("ESTADO_NO_PERMITE", "Solo se califica un ticket cerrado.");
  }
  if (message.includes("HD_CALIFICACION_LEGACY")) {
    return new TicketDomainError("TICKET_LEGACY", "Este ticket viene de PowerApps y se califica allí.");
  }
  return null;
}

/**
 * Traduce los errores con nombre de `helpdesk.resolver_responsable_tipo`, que
 * comparten la creación interna (T2) y la redirección de un ticket del
 * portal (T3).
 *
 * La función de PostgreSQL marca con un prefijo `HD_…` los fallos que
 * dependen de datos de enrutamiento y que la persona no puede corregir desde
 * el formulario. Se reconocen por ese prefijo, que forma parte del contrato de
 * la función, no por el texto libre que lo acompaña.
 */
export function translateCreationFailure(error: unknown): TicketDomainError | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("HD_SIN_RESPONSABLE")) {
    return new TicketDomainError(
      "SIN_RESPONSABLE",
      "El área elegida no tiene una persona que reciba sus tickets. Avisa a quien administra HelpDesk.",
    );
  }
  if (message.includes("HD_RESPONSABLE_INACTIVO")) {
    return new TicketDomainError(
      "RESPONSABLE_INACTIVO",
      "La persona que recibe los tickets de esta área ya no está activa. Avisa a quien administra HelpDesk.",
    );
  }
  if (message.includes("HD_RESPONSABLE_SIN_ACCESO")) {
    return new TicketDomainError(
      "RESPONSABLE_SIN_ACCESO",
      "La persona que recibe los tickets de esta área todavía no tiene acceso a HelpDesk. Avisa a quien administra HelpDesk.",
    );
  }
  return null;
}

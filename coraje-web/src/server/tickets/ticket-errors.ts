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
 * Traduce los errores con nombre de `helpdesk.crear_ticket_interno`.
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

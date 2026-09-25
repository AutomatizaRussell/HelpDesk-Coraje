/**
 * Forma común de la respuesta de toda acción de formulario de tickets.
 *
 * `values` devuelve lo que la persona escribió cuando la acción falla, para
 * que el formulario lo vuelva a mostrar: un error recuperable nunca borra lo
 * escrito (skill de diseño, «Datos, formularios y resiliencia»).
 *
 * `nonce` distingue un éxito del siguiente. El formulario lo usa como `key`
 * para vaciarse tras cada éxito, incluso si el mensaje es el mismo.
 */
export type TicketFormState =
  | { status: "idle" }
  | {
      status: "success";
      message: string;
      nonce: string;
      /** La acción se guardó, pero algún correo no salió: se dice aquí, junto a la acción. */
      warning?: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    };

export const IDLE_FORM_STATE: TicketFormState = { status: "idle" };

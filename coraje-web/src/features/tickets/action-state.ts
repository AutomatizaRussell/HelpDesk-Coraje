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
      /**
       * U31: «Nuevo ticket» ya no navega al detalle al crear: muestra una
       * confirmación con el código del ticket y quién lo recibió.
       */
      status: "created";
      idTicket: string;
      codigo: string | null;
      area: string | null;
      responsable: string | null;
      /** Algún correo del alta no salió; el detalle lo muestra en «Correos». */
      warning?: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    };

export const IDLE_FORM_STATE: TicketFormState = { status: "idle" };

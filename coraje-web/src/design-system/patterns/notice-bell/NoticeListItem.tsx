import { badge } from "../../recipes/badge";
import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Un aviso en una lista: el de la campana y el de la página de avisos.
 *
 * Es un formulario y no un enlace: abrirlo marca el aviso como leído, y una
 * escritura no puede ir en un GET (el navegador y Next precargan enlaces).
 * Funciona sin JavaScript: la acción marca y redirige al ticket.
 *
 * Lo no leído se distingue por el peso del título y por un punto, con su
 * texto para lectores de pantalla; nunca solo por color. Lo que requiere
 * atención lleva su etiqueta escrita.
 */
export type NoticeListItemProps = {
  id: string;
  title: string;
  detail: string;
  /** Fecha ya formateada. */
  meta: string;
  unread: boolean;
  attention: boolean;
  /** Acción que recibe `idAviso`, lo marca leído y lleva a su destino. */
  action: (formData: FormData) => void | Promise<void>;
};

export function NoticeListItem({ id, title, detail, meta, unread, attention, action }: NoticeListItemProps) {
  return (
    <li>
      <form action={action}>
        <input type="hidden" name="idAviso" value={id} />
        <button
          type="submit"
          className={cn(
            "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-sunken",
            colorTransition,
            focusRing,
          )}
        >
          <span
            aria-hidden="true"
            className={cn("mt-2 size-2 shrink-0 rounded-pill", unread ? "bg-action" : "invisible")}
          />
          <span className="min-w-0 flex-1">
            <span className={cn("block text-base text-heading", unread ? "font-bold" : "font-normal")}>
              {unread && <span className="sr-only">Sin leer: </span>}
              {title}
            </span>
            {detail && <span className="mt-0.5 block truncate text-sm text-ink-muted">{detail}</span>}
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {attention && <span className={badge("info")}>Requiere tu atención</span>}
              <span className="tabular-nums">{meta}</span>
            </span>
          </span>
        </button>
      </form>
    </li>
  );
}

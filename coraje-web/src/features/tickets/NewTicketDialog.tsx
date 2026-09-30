"use client";

import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { iconStroke } from "@/design-system/foundations/iconography";
import { colorTransition, focusRing } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";

/**
 * «Nuevo ticket» abierto encima de la bandeja (decisión del usuario del
 * 30-sep-2026). Es la ruta interceptada `app/tickets/@modal/(.)nuevo`: desde
 * la bandeja se abre aquí; abrir o recargar `/tickets/nuevo` directamente
 * sigue mostrando la página completa. Así la URL se puede compartir y el
 * botón atrás cierra la ventana, que eran los dos riesgos de una ventana
 * emergente para un formulario largo.
 *
 * `<dialog>` nativo, como el sidebar de Conecta: bloqueo del foco, Escape y
 * capa superior sin librería. Cerrar —con Escape, con la X, con «Cancelar» o
 * con un clic en el fondo— pide confirmación si ya se escribió algo: un
 * formulario a medio llenar no se pierde por un clic de más.
 */

const DISCARD_QUESTION = "¿Descartar el ticket? Se perderá lo que escribiste.";
const DIALOG_PATH = "/tickets/nuevo";

/** Cierre de la ventana, para que el formulario lo use en «Cancelar». */
const CloseDialogContext = createContext<(() => void) | null>(null);

/** `null` fuera de la ventana: el formulario está en su página completa. */
export function useCloseDialog(): (() => void) | null {
  return useContext(CloseDialogContext);
}

export function NewTicketDialog({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  // El slot conserva esta página al navegar a otra URL de /tickets (por
  // ejemplo, al detalle del ticket recién creado). Fuera de su URL, la
  // ventana no existe.
  const open = pathname === DIALOG_PATH;

  useEffect(() => {
    if (!open) {
      dirty.current = false;
      return;
    }
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty.current && !window.confirm(DISCARD_QUESTION)) return;
    dirty.current = false;
    router.back();
  }, [router]);

  if (!open) return null;

  // El contenido ocupa todo el diálogo: un clic cuyo destino es el propio
  // <dialog> solo puede haber caído en el fondo oscurecido.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="nuevo-ticket-titulo"
      onCancel={(event) => {
        // Escape: el navegador cerraría sin preguntar.
        event.preventDefault();
        requestClose();
      }}
      onClick={closeOnBackdrop}
      onInput={() => {
        dirty.current = true;
      }}
      className="m-auto w-full max-w-form overflow-y-auto rounded-surface border border-line bg-surface shadow-overlay backdrop:bg-shell-scrim"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-6">
        <h2 id="nuevo-ticket-titulo" className="text-lg font-black tracking-tight text-heading">
          Nuevo ticket
        </h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Cerrar"
          className={cn("rounded-control p-2 text-ink-muted hover:bg-surface-sunken hover:text-heading", colorTransition, focusRing)}
        >
          <X aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
        </button>
      </div>
      <CloseDialogContext.Provider value={requestClose}>{children}</CloseDialogContext.Provider>
    </dialog>
  );
}

"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Ventana emergente con un formulario. Se usa solo cuando tapar lo de atrás
 * no cuesta nada (crear un ticket) o cuando conviene interrumpir (rechazar,
 * que no se deshace); para escribir mientras se lee, no: la respuesta de un
 * ticket va al final de su historia, a la vista.
 *
 * `<dialog>` nativo, como el sidebar de Conecta: bloqueo del foco, Escape,
 * devolución del foco y capa superior sin librería. Cerrar —Escape, la X, un
 * clic en el fondo o `requestClose` desde el contenido— pide confirmación si
 * ya se escribió algo: un error de clic no borra lo escrito.
 *
 * Controlado: quien lo usa decide cuándo está abierto (`open`) y qué pasa al
 * cerrar (`onClose`: volver atrás, cambiar un estado local).
 */
export type FormDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Pregunta antes de descartar lo escrito. */
  discardQuestion?: string;
  children: ReactNode;
};

const DEFAULT_DISCARD_QUESTION = "¿Descartar lo que escribiste?";

/** Cierre con la misma confirmación que la X, para un «Cancelar» del contenido. */
const FormDialogCloseContext = createContext<(() => void) | null>(null);

/** `null` fuera de una ventana: el contenido se dibuja en una página. */
export function useFormDialogClose(): (() => void) | null {
  return useContext(FormDialogCloseContext);
}

export function FormDialog({ open, title, onClose, discardQuestion = DEFAULT_DISCARD_QUESTION, children }: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dirty.current = false;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty.current && !window.confirm(discardQuestion)) return;
    dirty.current = false;
    onClose();
  }, [discardQuestion, onClose]);

  // El contenido ocupa todo el diálogo: un clic cuyo destino es el propio
  // <dialog> solo puede haber caído en el fondo oscurecido.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
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
      {open && (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-6">
            <h2 id={titleId} className="text-lg font-black tracking-tight text-heading">
              {title}
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
          <FormDialogCloseContext.Provider value={requestClose}>{children}</FormDialogCloseContext.Provider>
        </>
      )}
    </dialog>
  );
}

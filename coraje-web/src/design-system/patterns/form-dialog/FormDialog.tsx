"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import type { AreaThemeKey } from "../area/area";

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
  /** `wide`: el ancho del contenido, para mostrar un archivo (U29). Por omisión, el de un formulario. */
  size?: "form" | "wide";
  children: ReactNode;
};

const DEFAULT_DISCARD_QUESTION = "¿Descartar lo que escribiste?";

/** Cierre con la misma confirmación que la X, para un «Cancelar» del contenido. */
const FormDialogCloseContext = createContext<(() => void) | null>(null);

/** `null` fuera de una ventana: el contenido se dibuja en una página. */
export function useFormDialogClose(): (() => void) | null {
  return useContext(FormDialogCloseContext);
}

/**
 * Tono de la ventana (U31): el contenido elige un área y la ventana entera
 * toma su color —encabezado en la tinta, franja superior y acento de lo que
 * hay dentro—, con una línea bajo el título («Llegará a Contabilidad»).
 * `data-area` en el `<dialog>` redefine el acento, como en el shell (U16): el
 * contenido no necesita saber de colores. `null` vuelve al tono neutro.
 */
export type FormDialogTone = { area: AreaThemeKey; subtitle: string } | null;

const FormDialogToneContext = createContext<((tone: FormDialogTone) => void) | null>(null);

/** `null` fuera de una ventana. */
export function useFormDialogTone(): ((tone: FormDialogTone) => void) | null {
  return useContext(FormDialogToneContext);
}

export function FormDialog({ open, title, onClose, discardQuestion = DEFAULT_DISCARD_QUESTION, size = "form", children }: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const titleId = useId();
  const [tone, setTone] = useState<FormDialogTone>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dirty.current = false;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Al cerrar, la próxima apertura empieza neutra. Ajuste en el render, no en
  // un efecto: un efecto pintaría primero el tono viejo.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setTone(null);
  }

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
      data-area={tone?.area}
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
      className={cn(
        "m-auto w-full overflow-y-auto rounded-surface border border-line bg-surface shadow-overlay backdrop:bg-shell-scrim",
        size === "wide" ? "max-w-content" : "max-w-form",
      )}
    >
      {open && (
        <>
          <div aria-hidden="true" className={cn("h-hero-stripe", tone ? "bg-accent" : "bg-transparent", colorTransition)} />
          <div
            className={cn(
              "flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-6",
              tone && "bg-accent-surface",
              colorTransition,
            )}
          >
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-black tracking-tight text-heading">
                {title}
              </h2>
              {tone && <p className="text-base text-heading">{tone.subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Cerrar"
              className={cn("rounded-control p-2 text-ink-muted hover:bg-surface-sunken hover:text-heading", colorTransition, focusRing)}
            >
              <X aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
            </button>
          </div>
          <FormDialogToneContext.Provider value={setTone}>
            <FormDialogCloseContext.Provider value={requestClose}>{children}</FormDialogCloseContext.Provider>
          </FormDialogToneContext.Provider>
        </>
      )}
    </dialog>
  );
}

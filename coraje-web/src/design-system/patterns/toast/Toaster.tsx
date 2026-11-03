"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { IconButton } from "../../components/IconButton";
import { notice, type NoticeTone } from "../../recipes/surface";
import { cn } from "../../utilities/cn";

/**
 * Toast (U29, decisión del usuario del 30-oct-2026): el aviso que confirma lo
 * que acaba de pasar aparece en una esquina un momento y se va solo, en lugar
 * de quedarse fijo en la página.
 *
 * Solo para confirmar algo que ya ocurrió y no pide nada más. Lo que la
 * persona tiene que leer para actuar —un error, una advertencia de correo que
 * no salió— se queda junto a la acción que lo produjo, porque un toast se
 * va antes de que se pueda volver a mirar.
 *
 * Accesibilidad: el contenedor es una región `status` con `aria-live`, así que
 * el lector de pantalla anuncia cada mensaje sin mover el foco. Cada toast se
 * puede cerrar antes de tiempo, y el tiempo en pantalla deja leer dos líneas
 * con calma. Con movimiento reducido, la entrada es instantánea (regla global
 * de `globals.css`).
 */

/** Tiempo en pantalla. Es comportamiento, no aspecto: no es un token visual. */
const TOAST_MS = 6000;

export interface ToastInput {
  message: string;
  tone?: Extract<NoticeTone, "success" | "info">;
  /**
   * Identidad del mensaje. Un mismo id no se muestra dos veces: un formulario
   * que se vuelve a montar con el mismo resultado no repite el toast.
   */
  id?: string;
}

type Toast = Required<ToastInput>;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/**
 * La función para mostrar un toast, o `null` fuera de un `ToastProvider`.
 * Quien la use decide qué hacer sin él (normalmente, mostrar el mensaje en
 * línea, como antes del toast).
 */
export function useToast(): ((toast: ToastInput) => void) | null {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shown = useRef(new Set<string>());

  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? crypto.randomUUID();
      if (shown.current.has(id)) return;
      shown.current.add(id);
      setToasts((current) => [...current, { id, message: input.message, tone: input.tone ?? "success" }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-(--hd-layer-toast) flex flex-col items-end gap-2 sm:left-auto lg:right-8"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              notice(toast.tone),
              "pointer-events-auto flex w-full max-w-toast animate-toast-in items-start gap-3 shadow-overlay",
            )}
          >
            <p className="min-w-0 flex-1">{toast.message}</p>
            <IconButton label="Cerrar aviso" icon={X} onClick={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Muestra un toast al llegar a una página, para los avisos que hoy llegan por
 * la URL («ticket creado»), y limpia el parámetro de la barra de direcciones:
 * recargar la página no lo repite. `cleanHref` lo calcula la página, que ya
 * conoce su ruta sin el parámetro.
 */
export function FlashToast({ message, id, cleanHref }: { message: string; id: string; cleanHref: string }) {
  const toast = useToast();
  useEffect(() => {
    toast?.({ message, id });
    window.history.replaceState(window.history.state, "", cleanHref);
  }, [toast, message, id, cleanHref]);
  return null;
}

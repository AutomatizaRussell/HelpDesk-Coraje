"use client";

import { useEffect, useRef } from "react";

import { useToast } from "@/design-system/patterns/toast/Toaster";
import { notice } from "@/design-system/recipes/surface";
import type { TicketFormState } from "@/features/tickets/action-state";

/**
 * Resultado de una acción de formulario.
 *
 * - **Éxito:** un toast (U29), que se va solo. Fuera de un `ToastProvider`
 *   (el portal), en línea, como antes.
 * - **Error:** en línea, junto a la acción, con el foco: un lector de pantalla
 *   lo anuncia y la persona no tiene que buscarlo.
 * - **Advertencia de un éxito** (la acción se guardó, pero un correo no salió):
 *   en línea también, porque pide hacer algo (reenviarlo) y un toast se iría
 *   antes.
 */
export function FormFeedback({ state }: { state: TicketFormState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const toast = useToast();
  const asToast = toast !== null && state.status === "success";
  useEffect(() => {
    if (state.status === "success" && toast) {
      toast({ message: state.message, id: state.nonce });
      return;
    }
    if (state.status === "error" || state.status === "success") ref.current?.focus();
  }, [state, toast]);
  // «Creado» (U31) lo dibuja su propio formulario: la confirmación de «Nuevo
  // ticket», con el código del ticket.
  if (state.status === "idle" || state.status === "created") return null;
  if (asToast) return state.warning ? <p className={notice("warning")}>{state.warning}</p> : null;
  return (
    <div className="space-y-2">
      <p
        ref={ref}
        tabIndex={-1}
        role={state.status === "error" ? "alert" : "status"}
        className={notice(state.status === "error" ? "danger" : "success")}
      >
        {state.message}
      </p>
      {state.status === "success" && state.warning && <p className={notice("warning")}>{state.warning}</p>}
    </div>
  );
}

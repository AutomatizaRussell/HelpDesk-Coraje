"use client";

import { useEffect, useRef } from "react";

import { notice } from "@/design-system/recipes/surface";
import type { TicketFormState } from "@/features/tickets/action-state";

/**
 * Resultado de una acción de formulario, junto a la acción que lo produjo.
 *
 * El mensaje recibe el foco para que un lector de pantalla lo anuncie y la
 * persona no tenga que buscarlo. Un éxito con advertencia (la acción se
 * guardó, pero un correo no salió) muestra las dos cosas: ni oculta la
 * advertencia ni convierte el éxito en error.
 */
export function FormFeedback({ state }: { state: TicketFormState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "idle") ref.current?.focus();
  }, [state]);
  if (state.status === "idle") return null;
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

"use client";

import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldLabel } from "@/design-system/recipes/field";
import { notice } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { FormFeedback } from "@/features/forms/FormFeedback";
import { IDLE_FORM_STATE } from "@/features/tickets/action-state";
import type { SuplantacionPanel } from "@/server/auth/suplantacion";

import { changeSuplantacionAction } from "./actions";

/**
 * SUPLANTACIÓN — bloque temporal para pruebas.
 *
 * Selector de persona encima del contenido de cada vista, solo para quien
 * está habilitado. Mientras se suplanta, el aviso cambia de tono y ofrece
 * volver en un clic: tiene que ser imposible olvidar como quién se trabaja.
 *
 * La lista y el valor inicial llegan del servidor; ocultar el selector no es
 * el control, la acción vuelve a comprobarlo todo.
 */
export function SuplantacionSelector({ panel }: { panel: SuplantacionPanel }) {
  const [state, formAction, pending] = useActionState(changeSuplantacionAction, IDLE_FORM_STATE);
  const suplantando = panel.idPersonalActivo !== panel.idPersonalReal;
  const activo = panel.opciones.find((opcion) => opcion.idPersonal === panel.idPersonalActivo);

  return (
    <section aria-label="Trabajar como otra persona" className={cn(notice(suplantando ? "warning" : "info"), "mb-6 space-y-3")}>
      {suplantando && (
        <p className="font-bold">
          Trabajas como {activo?.nombreCompleto ?? "otra persona"}. Lo que hagas queda a su nombre, y los correos llegan
          solo a tu buzón.
        </p>
      )}
      {/* `key`: tras cada cambio el servidor devuelve otra persona activa, y
          un <select> no controlado solo toma su valor inicial al montarse. */}
      <form key={panel.idPersonalActivo} action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="suplantacion-persona" className={fieldLabel}>
            Trabajar como
          </label>
          <select
            id="suplantacion-persona"
            name="idPersonal"
            defaultValue={panel.idPersonalActivo}
            className={fieldControl()}
          >
            <option value={panel.idPersonalReal}>{panel.nombreReal} (tú)</option>
            {panel.opciones
              .filter((opcion) => opcion.idPersonal !== panel.idPersonalReal)
              .map((opcion) => (
                <option key={opcion.idPersonal} value={opcion.idPersonal}>
                  {opcion.nombreCompleto} · {opcion.rolAplicacion}
                </option>
              ))}
          </select>
        </div>
        <button type="submit" className={buttonRecipe({ variant: "secondary" })} disabled={pending}>
          {pending ? "Cambiando…" : "Cambiar"}
        </button>
      </form>
      {suplantando && (
        <form action={formAction}>
          <input type="hidden" name="idPersonal" value={panel.idPersonalReal} />
          <button type="submit" className={buttonRecipe({ variant: "primary", size: "sm" })} disabled={pending}>
            Volver a mi usuario
          </button>
        </form>
      )}
      <FormFeedback state={state} />
    </section>
  );
}

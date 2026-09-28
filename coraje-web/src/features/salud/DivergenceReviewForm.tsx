"use client";

import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { FormFeedback } from "@/features/forms/FormFeedback";
import { IDLE_FORM_STATE } from "@/features/tickets/action-state";

import { reviewDivergenceAction } from "./actions";

/**
 * Marcar revisada una divergencia rechazada (S4). La vista solo lo dibuja
 * con `salud.divergencia.revisar`; la acción lo vuelve a exigir.
 *
 * Hay uno por divergencia en la misma página, así que el `id` del campo
 * lleva el de la divergencia. Tras un éxito, la vista se revalida y la fila
 * desaparece de las pendientes: el mensaje de éxito lo anuncia antes.
 */
export function DivergenceReviewForm({ idDivergencia }: { idDivergencia: string }) {
  const [state, formAction, pending] = useActionState(reviewDivergenceAction, IDLE_FORM_STATE);
  const error = state.status === "error" ? state.fieldErrors.motivo : undefined;
  const id = `motivo-${idDivergencia}`;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="idDivergencia" value={idDivergencia} />
      <FormFeedback state={state} />
      <div>
        <label htmlFor={id} className={fieldLabel}>Qué se hizo</label>
        <textarea
          id={id}
          name="motivo"
          rows={2}
          defaultValue={state.status === "error" ? (state.values.motivo ?? "") : ""}
          className={fieldControl({ invalid: Boolean(error), multiline: true })}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
        {error ? (
          <p id={`${id}-error`} className={fieldError}>{error}</p>
        ) : (
          <p id={`${id}-hint`} className={fieldHint}>
            Por ejemplo: «Se deshizo el cambio en PowerApps» o «Se hizo la acción en HelpDesk».
          </p>
        )}
      </div>
      <button type="submit" className={buttonRecipe({ variant: "secondary" })} disabled={pending}>
        {pending ? "Guardando…" : "Marcar revisada"}
      </button>
    </form>
  );
}

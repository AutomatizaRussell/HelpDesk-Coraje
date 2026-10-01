"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldHint } from "@/design-system/recipes/field";
import { notice } from "@/design-system/recipes/surface";
import { IDLE_FORM_STATE } from "@/features/tickets/action-state";
import { TipoRequerimientoFields } from "@/features/tickets/TipoRequerimientoFields";
import type { CreationCatalog } from "@/server/tickets/ticket-queries";

import { redirectTicketAction } from "./actions";

/**
 * Redirigir un ticket del portal (T3): elegir el tipo de requerimiento. El
 * tipo decide el área, y la regla de enrutamiento decide la persona, igual
 * que al crear un ticket interno. Quien redirige no elige a la persona.
 */
export function RedirectForm({
  idTicket,
  catalog,
  backHref,
}: {
  idTicket: string;
  catalog: Pick<CreationCatalog, "areas" | "tipos">;
  /** «Por redirigir» en la bandeja de Coraje. */
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState(redirectTicketAction, IDLE_FORM_STATE);
  const failed = state.status === "error" ? state : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="idTicket" value={idTicket} />
      {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}
      <TipoRequerimientoFields
        key={failed?.values.idTipoReq ?? "inicial"}
        catalog={catalog}
        initialIdTipoReq={failed?.values.idTipoReq}
        error={failed?.fieldErrors.idTipoReq}
      />
      <p className={fieldHint}>
        El tipo decide el área y la persona que atiende el ticket. Al redirigirlo empieza el plazo de 3 días hábiles para
        responder al cliente.
      </p>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" className={buttonRecipe({ variant: "primary" })} disabled={pending}>
          {pending ? "Redirigiendo…" : "Redirigir al área"}
        </button>
        <Link href={backHref} className={buttonRecipe({ variant: "secondary" })}>Volver a la bandeja</Link>
      </div>
    </form>
  );
}

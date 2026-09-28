"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { notice, surface } from "@/design-system/recipes/surface";
import { IDLE_FORM_STATE, type TicketFormState } from "@/features/tickets/action-state";

import { createPortalTicketAction } from "./actions";
import { requestCodeAction, verifyCodeAction } from "./entry-actions";

/**
 * Formularios del portal de clientes. Conservan lo escrito si la acción
 * falla: un error recuperable nunca borra el trabajo de la persona
 * (acceso-clientes.md §4, invariante 3).
 */

function errorOf(state: TicketFormState, field: string): string | undefined {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

function valueOf(state: TicketFormState, field: string): string {
  return state.status === "error" ? (state.values[field] ?? "") : "";
}

function FormError({ state }: { state: TicketFormState }) {
  if (state.status !== "error") return null;
  return <p className={notice("danger")} role="alert">{state.message}</p>;
}

export function RequestCodeForm() {
  const [state, formAction, pending] = useActionState(requestCodeAction, IDLE_FORM_STATE);
  const error = errorOf(state, "correo");
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError state={state} />
      <div>
        <label htmlFor="correo" className={fieldLabel}>Correo</label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={valueOf(state, "correo")}
          className={fieldControl({ invalid: Boolean(error) })}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "correo-error" : "correo-hint"}
        />
        {error ? (
          <p id="correo-error" className={fieldError}>{error}</p>
        ) : (
          <p id="correo-hint" className={fieldHint}>El mismo correo en el que recibiste tu invitación.</p>
        )}
      </div>
      <button type="submit" className={buttonRecipe({ size: "lg", fullWidth: true })} disabled={pending}>
        {pending ? "Enviando…" : "Enviarme un código"}
      </button>
    </form>
  );
}

export function VerifyCodeForm() {
  const [state, formAction, pending] = useActionState(verifyCodeAction, IDLE_FORM_STATE);
  const error = errorOf(state, "codigo");
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError state={state} />
      <div>
        <label htmlFor="codigo" className={fieldLabel}>Código de seis dígitos</label>
        <input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          defaultValue={valueOf(state, "codigo")}
          className={fieldControl({ invalid: Boolean(error) })}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "codigo-error" : undefined}
        />
        {error && <p id="codigo-error" className={fieldError}>{error}</p>}
      </div>
      <button type="submit" className={buttonRecipe({ size: "lg", fullWidth: true })} disabled={pending}>
        {pending ? "Verificando…" : "Entrar"}
      </button>
    </form>
  );
}

export function CreatePortalTicketForm() {
  const [state, formAction, pending] = useActionState(createPortalTicketAction, IDLE_FORM_STATE);
  const error = errorOf(state, "descripcion");
  return (
    <form action={formAction} className={surface()} noValidate>
      <div className="space-y-5">
        <FormError state={state} />
        <div>
          <label htmlFor="descripcion" className={fieldLabel}>¿En qué te podemos ayudar?</label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={8}
            defaultValue={valueOf(state, "descripcion")}
            className={fieldControl({ invalid: Boolean(error), multiline: true })}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? "descripcion-error" : "descripcion-hint"}
          />
          {error ? (
            <p id="descripcion-error" className={fieldError}>{error}</p>
          ) : (
            <p id="descripcion-hint" className={fieldHint}>
              Describe tu solicitud con los datos que ayuden a resolverla. El equipo la asigna al área que corresponde y
              te responde por correo y aquí.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className={buttonRecipe({ variant: "primary" })} disabled={pending}>
            {pending ? "Enviando…" : "Enviar solicitud"}
          </button>
          <Link href="/portal" className={buttonRecipe({ variant: "secondary" })}>Cancelar</Link>
        </div>
      </div>
    </form>
  );
}

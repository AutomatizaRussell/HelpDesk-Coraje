"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { buttonRecipe, type ButtonVariant } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { notice } from "@/design-system/recipes/surface";

import { IDLE_FORM_STATE, type TicketFormState } from "./action-state";
import {
  addInternalNoteAction,
  reassignTicketAction,
  rejectTicketAction,
  resendTicketMailAction,
  respondTicketAction,
} from "./actions";

/**
 * Formularios de las acciones sobre un ticket. Solo se dibujan los que el
 * detalle marcó como posibles (`TicketCapabilities`), con las mismas reglas
 * que el servicio aplica; el servicio lo vuelve a comprobar de todos modos.
 *
 * Cada formulario conserva lo escrito si la acción falla y se vacía cuando
 * tiene éxito: la clave del `<form>` cambia con cada éxito y React lo monta
 * de nuevo.
 */
type Action = (prev: TicketFormState, formData: FormData) => Promise<TicketFormState>;

function useTicketForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  return { state, formAction, pending, formKey: state.status === "success" ? state.nonce : "formulario" };
}

function FormFeedback({ state }: { state: TicketFormState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  // El mensaje recibe el foco para que un lector de pantalla lo anuncie y la
  // persona no tenga que buscarlo.
  useEffect(() => {
    if (state.status !== "idle") ref.current?.focus();
  }, [state]);
  if (state.status === "idle") return null;
  return (
    <div className="space-y-2">
      <p ref={ref} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className={notice(state.status === "error" ? "danger" : "success")}>
        {state.message}
      </p>
      {state.status === "success" && state.warning && <p className={notice("warning")}>{state.warning}</p>}
    </div>
  );
}

function TextField({
  name,
  label,
  hint,
  state,
  rows = 4,
}: {
  name: string;
  label: string;
  hint?: string;
  state: TicketFormState;
  rows?: number;
}) {
  const error = state.status === "error" ? state.fieldErrors[name] : undefined;
  const id = `campo-${name}`;
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>{label}</label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={state.status === "error" ? (state.values[name] ?? "") : ""}
        className={fieldControl({ invalid: Boolean(error), multiline: true })}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className={fieldError}>{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className={fieldHint}>{hint}</p>
      )}
    </div>
  );
}

function Submit({ pending, variant, children }: { pending: boolean; variant: ButtonVariant; children: ReactNode }) {
  return (
    <button type="submit" className={buttonRecipe({ variant })} disabled={pending}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function RespondForm({ idTicket }: { idTicket: string }) {
  const { state, formAction, pending, formKey } = useTicketForm(respondTicketAction);
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <TextField
        name="respuesta"
        label="Respuesta al solicitante"
        hint="El solicitante la recibe. Al responder, el ticket queda cerrado."
        state={state}
        rows={6}
      />
      <Submit pending={pending} variant="primary">Responder y cerrar</Submit>
    </form>
  );
}

export function InternalNoteForm({ idTicket }: { idTicket: string }) {
  const { state, formAction, pending, formKey } = useTicketForm(addInternalNoteAction);
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <TextField name="nota" label="Nota interna" hint="Solo la ve el equipo. El solicitante no la recibe." state={state} />
      <Submit pending={pending} variant="secondary">Guardar nota</Submit>
    </form>
  );
}

export function ReassignForm({
  idTicket,
  candidates,
}: {
  idTicket: string;
  candidates: { idPersonal: string; nombreCompleto: string }[];
}) {
  const { state, formAction, pending, formKey } = useTicketForm(reassignTicketAction);
  const error = state.status === "error" ? state.fieldErrors.idNuevoResponsable : undefined;

  if (candidates.length === 0) {
    return <p className="text-base text-ink-muted">No hay otra persona de tu área con acceso a HelpDesk.</p>;
  }

  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <div>
        <label htmlFor="campo-idNuevoResponsable" className={fieldLabel}>Nueva persona responsable</label>
        <select
          id="campo-idNuevoResponsable"
          name="idNuevoResponsable"
          defaultValue={state.status === "error" ? (state.values.idNuevoResponsable ?? "") : ""}
          className={fieldControl({ invalid: Boolean(error) })}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "campo-idNuevoResponsable-error" : "campo-idNuevoResponsable-hint"}
        >
          <option value="">Elige una persona</option>
          {candidates.map((candidate) => (
            <option key={candidate.idPersonal} value={candidate.idPersonal}>{candidate.nombreCompleto}</option>
          ))}
        </select>
        {error ? (
          <p id="campo-idNuevoResponsable-error" className={fieldError}>{error}</p>
        ) : (
          <p id="campo-idNuevoResponsable-hint" className={fieldHint}>El plazo de respuesta no cambia.</p>
        )}
      </div>
      <TextField name="comentario" label="Comentario para el equipo (opcional)" state={state} rows={3} />
      <Submit pending={pending} variant="secondary">Reasignar</Submit>
    </form>
  );
}

/** Reenvío de un correo que no salió. Solo se dibuja para quien lo envió. */
export function ResendMailForm({ idNotificacion }: { idNotificacion: string }) {
  const [state, formAction, pending] = useActionState(resendTicketMailAction, IDLE_FORM_STATE);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="idNotificacion" value={idNotificacion} />
      <FormFeedback state={state} />
      <button type="submit" className={buttonRecipe({ variant: "secondary", size: "sm" })} disabled={pending}>
        {pending ? "Enviando…" : "Reenviar"}
      </button>
    </form>
  );
}

export function RejectForm({ idTicket }: { idTicket: string }) {
  const { state, formAction, pending, formKey } = useTicketForm(rejectTicketAction);
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <TextField
        name="motivo"
        label="Motivo del rechazo"
        hint="El solicitante lo recibe. Un ticket rechazado no se puede reabrir."
        state={state}
      />
      <Submit pending={pending} variant="danger">Rechazar ticket</Submit>
    </form>
  );
}

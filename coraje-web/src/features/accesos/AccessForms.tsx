"use client";

import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { FormFeedback } from "@/features/forms/FormFeedback";
import { IDLE_FORM_STATE, type TicketFormState } from "@/features/tickets/action-state";

import {
  grantAgainAction,
  grantNewContactAction,
  reissueInvitationAction,
  revokeAccessAction,
  setReadOnlyAction,
} from "./actions";

/**
 * Formularios de la consola de accesos. La vista solo dibuja los que el
 * estado del acceso admite; el servicio lo vuelve a comprobar, y exige
 * `portal.acceso.administrar` en cada uno.
 *
 * Cada formulario se vacía tras un éxito (la clave cambia con el `nonce`) y
 * conserva lo escrito si falla.
 */
type Action = (prev: TicketFormState, formData: FormData) => Promise<TicketFormState>;

function useAccessForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  return { state, formAction, pending, formKey: state.status === "success" ? state.nonce : "formulario" };
}

function valueOf(state: TicketFormState, field: string): string {
  return state.status === "error" ? (state.values[field] ?? "") : "";
}

function errorOf(state: TicketFormState, field: string): string | undefined {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

function Field({ name, label, hint, type = "text", state }: { name: string; label: string; hint?: string; type?: string; state: TicketFormState }) {
  const error = errorOf(state, name);
  const id = `campo-${name}`;
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={valueOf(state, name)}
        className={fieldControl({ invalid: Boolean(error) })}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {error ? <p id={`${id}-error`} className={fieldError}>{error}</p> : hint && <p id={`${id}-hint`} className={fieldHint}>{hint}</p>}
    </div>
  );
}

export function NewContactForm({ idCliente }: { idCliente: string }) {
  const { state, formAction, pending, formKey } = useAccessForm(grantNewContactAction);
  return (
    <form key={formKey} action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="idCliente" value={idCliente} />
      <FormFeedback state={state} />
      <Field name="nombre" label="Nombre completo" state={state} />
      <Field
        name="correo"
        label="Correo"
        type="email"
        hint="Recibe la invitación y, después, los códigos de acceso. Un correo solo puede ser de un contacto."
        state={state}
      />
      <button type="submit" className={buttonRecipe({ variant: "primary" })} disabled={pending}>
        {pending ? "Enviando…" : "Dar acceso e invitar"}
      </button>
    </form>
  );
}

/** Botón de una sola acción, con su aviso de resultado encima. */
function SingleActionForm({
  action,
  hidden,
  label,
  pendingLabel,
  variant = "secondary",
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: "secondary" | "danger";
}) {
  const { state, formAction, pending } = useAccessForm(action);
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormFeedback state={state} />
      <button type="submit" className={buttonRecipe({ variant, size: "sm" })} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

export function ReissueInvitationForm({ idCliente, idAutorizacion }: { idCliente: string; idAutorizacion: string }) {
  return (
    <SingleActionForm
      action={reissueInvitationAction}
      hidden={{ idCliente, idAutorizacion }}
      label="Reenviar invitación"
      pendingLabel="Enviando…"
    />
  );
}

export function GrantAgainForm({ idCliente, idContacto }: { idCliente: string; idContacto: string }) {
  return (
    <SingleActionForm action={grantAgainAction} hidden={{ idCliente, idContacto }} label="Dar acceso de nuevo" pendingLabel="Enviando…" />
  );
}

export function ReadOnlyForm({ idCliente, idAutorizacion, soloLectura }: { idCliente: string; idAutorizacion: string; soloLectura: boolean }) {
  return (
    <SingleActionForm
      action={setReadOnlyAction}
      hidden={{ idCliente, idAutorizacion, soloLectura: soloLectura ? "no" : "si" }}
      label={soloLectura ? "Permitir radicar" : "Dejar en solo consulta"}
      pendingLabel="Guardando…"
    />
  );
}

export function RevokeAccessForm({ idCliente, idAutorizacion }: { idCliente: string; idAutorizacion: string }) {
  const { state, formAction, pending, formKey } = useAccessForm(revokeAccessAction);
  const error = errorOf(state, "motivo");
  const id = `motivo-${idAutorizacion}`;
  return (
    <form key={formKey} action={formAction} className="space-y-2">
      <input type="hidden" name="idCliente" value={idCliente} />
      <input type="hidden" name="idAutorizacion" value={idAutorizacion} />
      <FormFeedback state={state} />
      <label htmlFor={id} className={fieldLabel}>Motivo de la revocación</label>
      <input
        id={id}
        name="motivo"
        defaultValue={valueOf(state, "motivo")}
        className={fieldControl({ invalid: Boolean(error) })}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
      />
      {error ? (
        <p id={`${id}-error`} className={fieldError}>{error}</p>
      ) : (
        <p id={`${id}-hint`} className={fieldHint}>Cierra todos sus navegadores. Sus tickets abiertos siguen en atención.</p>
      )}
      <button type="submit" className={buttonRecipe({ variant: "danger", size: "sm" })} disabled={pending}>
        {pending ? "Revocando…" : "Revocar acceso"}
      </button>
    </form>
  );
}

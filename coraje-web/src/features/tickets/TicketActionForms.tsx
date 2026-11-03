"use client";

import { X } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { IconButton } from "@/design-system/components/IconButton";
import { buttonRecipe, type ButtonVariant } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { AttachmentPicker } from "@/features/attachments/AttachmentPicker";
import { FormFeedback } from "@/features/forms/FormFeedback";

import type { FollowCandidate } from "@/server/tickets/ticket-queries";

import { IDLE_FORM_STATE, type TicketFormState } from "./action-state";
import {
  addInternalNoteAction,
  addObserversAction,
  commentAsRequesterAction,
  reassignTicketAction,
  removeObserverAction,
  requestApprovalAction,
  resendTicketMailAction,
  respondApprovalAction,
  respondTicketAction,
  withdrawApprovalAction,
} from "./actions";
import { NoCandidatesNotice, PeoplePicker } from "./PeoplePicker";

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

/**
 * El cuadro de escritura del ticket: un solo texto y un botón por acción
 * (decisión del usuario del 03-nov-2026, que retira las pestañas). Cada botón
 * dice qué pasa al pulsarlo, así que nadie tiene que mirar en qué pestaña está
 * para saber si el solicitante lo va a leer:
 * - «Responder y cerrar» envía el texto al solicitante y cierra el ticket;
 * - «Enviar comentario» lo escribe quien radicó, sin cerrar nada;
 * - «Guardar nota interna» lo deja solo para el equipo.
 *
 * Los adjuntos van con responder y con la nota (tickets.md §14.4), no con el
 * comentario del solicitante: si solo se puede comentar, no hay selector.
 *
 * Cada botón dispara su propia acción de servidor (`formAction`), con su
 * propio estado; se muestra el del último que se pulsó. Tras un éxito de
 * cualquiera de los dos, el formulario se monta de nuevo y queda vacío.
 */
export function TicketComposer({
  idTicket,
  canRespond,
  canComment,
  canNote,
  waitingApprovalFrom = null,
}: {
  idTicket: string;
  canRespond: boolean;
  canComment: boolean;
  canNote: boolean;
  /** U29: con una aprobación pendiente, el ticket no se cierra. Nombra a quien falta. */
  waitingApprovalFrom?: string | null;
}) {
  const [respondState, respondAction, responding] = useActionState(respondTicketAction, IDLE_FORM_STATE);
  const [commentState, commentAction, commenting] = useActionState(commentAsRequesterAction, IDLE_FORM_STATE);
  const [noteState, noteAction, noting] = useActionState(addInternalNoteAction, IDLE_FORM_STATE);
  const [last, setLast] = useState<"responder" | "comentar" | "nota">(canRespond ? "responder" : canComment ? "comentar" : "nota");
  const [uploading, setUploading] = useState(false);
  const state = { responder: respondState, comentar: commentState, nota: noteState }[last];
  const pending = responding || commenting || noting;
  const formKey = [respondState, commentState, noteState].map((item) => (item.status === "success" ? item.nonce : "-")).join(":");
  const attaches = canRespond || canNote;
  const hint = [
    canRespond && "«Responder y cerrar» se lo envía al solicitante y cierra el ticket.",
    canComment && "«Enviar comentario» lo ve el equipo que lo atiende y avisa a la persona responsable; el ticket sigue abierto.",
    canNote && "«Guardar nota interna» solo lo ve el equipo.",
  ]
    .filter(Boolean)
    .join(" ");
  const primary = canRespond ? "responder" : canComment ? "comentar" : "nota";
  const variant = (action: typeof primary) => (action === primary ? "primary" : "secondary");

  return (
    <form key={formKey} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <TextField name="texto" label="Escribe en el ticket" hint={hint} state={state} rows={6} />
      {attaches && (
        <AttachmentPicker onBusyChange={setUploading} error={state.status === "error" ? state.fieldErrors.adjuntos : undefined} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {canRespond && (
          <button
            type="submit"
            formAction={respondAction}
            onClick={() => setLast("responder")}
            className={buttonRecipe({ variant: variant("responder") })}
            disabled={pending || uploading || waitingApprovalFrom !== null}
            aria-describedby={waitingApprovalFrom ? "cierre-bloqueado" : undefined}
          >
            {responding ? "Guardando…" : uploading ? "Subiendo adjuntos…" : "Responder y cerrar"}
          </button>
        )}
        {canComment && (
          <button
            type="submit"
            formAction={commentAction}
            onClick={() => setLast("comentar")}
            className={buttonRecipe({ variant: variant("comentar") })}
            disabled={pending || uploading}
          >
            {commenting ? "Enviando…" : "Enviar comentario"}
          </button>
        )}
        {canNote && (
          <button
            type="submit"
            formAction={noteAction}
            onClick={() => setLast("nota")}
            className={buttonRecipe({ variant: variant("nota") })}
            disabled={pending || uploading}
          >
            {noting ? "Guardando…" : "Guardar nota interna"}
          </button>
        )}
      </div>
      {canRespond && waitingApprovalFrom && (
        <p id="cierre-bloqueado" className={fieldHint}>
          Se puede responder y cerrar cuando {waitingApprovalFrom} responda la aprobación, o si se retira la solicitud.
        </p>
      )}
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

// ---------------------------------------------------------------------------
// Seguimiento (U11)
// ---------------------------------------------------------------------------

/** Lo que se eligió en un intento fallido, para no perderlo (actions.ts, `formValues`). */
function previousSelection(state: TicketFormState, name: string): string[] {
  const value = state.status === "error" ? state.values[name] : undefined;
  return value ? value.split(",") : [];
}

export function AddObserversForm({
  idTicket,
  candidates,
  max,
}: {
  idTicket: string;
  candidates: readonly FollowCandidate[];
  max: number;
}) {
  const { state, formAction, pending, formKey } = useTicketForm(addObserversAction);
  // Sin nadie a quien elegir, enviar solo podría fallar: ni formulario ni botón.
  if (candidates.length === 0) return <NoCandidatesNotice />;
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <PeoplePicker
        name="idObservadores"
        label="Personas que seguirán el ticket"
        hint="Lo verán y recibirán aviso cuando se responda o se rechace. No podrán actuar sobre él."
        candidates={candidates}
        mode="multiple"
        max={max}
        initialSelected={previousSelection(state, "idObservadores")}
        error={state.status === "error" ? state.fieldErrors.idObservadores : undefined}
      />
      <Submit pending={pending} variant="secondary">Añadir observadores</Submit>
    </form>
  );
}

/** Retirar a una persona: una × junto a su nombre, con su nombre accesible. */
export function RemoveObserverForm({ idTicket, idObservador, nombre }: { idTicket: string; idObservador: string; nombre: string }) {
  const [state, formAction, pending] = useActionState(removeObserverAction, IDLE_FORM_STATE);
  const label = `Retirar a ${nombre} del seguimiento`;
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="idTicket" value={idTicket} />
      <input type="hidden" name="idObservador" value={idObservador} />
      {state.status === "error" && <FormFeedback state={state} />}
      <IconButton type="submit" label={label} icon={X} disabled={pending} />
    </form>
  );
}

/** Pedir a una persona que apruebe algo (U29). Bloquea el cierre hasta que responda. */
export function RequestApprovalForm({ idTicket, candidates }: { idTicket: string; candidates: readonly FollowCandidate[] }) {
  const { state, formAction, pending, formKey } = useTicketForm(requestApprovalAction);
  // Sin nadie a quien elegir, enviar solo podría fallar: ni formulario ni botón.
  if (candidates.length === 0) return <NoCandidatesNotice />;
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <PeoplePicker
        name="idDestinatario"
        label="Quién debe aprobar"
        hint="Le llega un aviso y podrá abrir el ticket. No pasa a ser observador."
        candidates={candidates}
        mode="single"
        initialSelected={previousSelection(state, "idDestinatario")}
        error={state.status === "error" ? state.fieldErrors.idDestinatario : undefined}
      />
      <TextField
        name="comentario"
        label="Qué debe aprobar"
        hint="Solo lo ve el equipo. Hasta que responda, el ticket no se puede cerrar."
        state={state}
      />
      <Submit pending={pending} variant="primary">Pedir aprobación</Submit>
    </form>
  );
}

/**
 * La respuesta de quien aprueba (U29). Dos botones en el mismo formulario,
 * cada uno con su `decision`. «No aprobar» exige el motivo; la acción lo
 * valida y el formulario vuelve con lo escrito si falta.
 */
export function ApprovalResponseForm({ idTicket }: { idTicket: string }) {
  const { state, formAction, pending, formKey } = useTicketForm(respondApprovalAction);
  return (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="idTicket" value={idTicket} />
      <FormFeedback state={state} />
      <TextField
        name="comentario"
        label="Comentario"
        hint="Obligatorio si no apruebas: el responsable lo necesita para responder. Solo lo ve el equipo."
        state={state}
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="APROBADA" className={buttonRecipe({ variant: "primary", size: "sm" })} disabled={pending}>
          Aprobar
        </button>
        <button type="submit" name="decision" value="NO_APROBADA" className={buttonRecipe({ variant: "secondary", size: "sm" })} disabled={pending}>
          No aprobar
        </button>
      </div>
    </form>
  );
}

/** Retirar la aprobación pendiente: quien la pidió o el responsable. */
export function WithdrawApprovalForm({ idTicket }: { idTicket: string }) {
  const [state, formAction, pending] = useActionState(withdrawApprovalAction, IDLE_FORM_STATE);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="idTicket" value={idTicket} />
      {state.status === "error" && <FormFeedback state={state} />}
      <button type="submit" className={buttonRecipe({ variant: "secondary", size: "sm" })} disabled={pending}>
        {pending ? "Retirando…" : "Retirar solicitud"}
      </button>
    </form>
  );
}

"use client";

import { CircleCheck, Copy, Send } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useFormDialogClose, useFormDialogTone } from "@/design-system/patterns/form-dialog/FormDialog";
import { iconStroke } from "@/design-system/foundations/iconography";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { colorTransition, focusRing } from "@/design-system/recipes/interaction";
import { notice, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { areaDisplayName, areaThemeKey } from "@/features/areas/area-theme";
import { AttachmentPicker } from "@/features/attachments/AttachmentPicker";
import type { CreationCatalog, FollowCandidate } from "@/server/tickets/ticket-queries";

import { IDLE_FORM_STATE, type TicketFormState } from "./action-state";
import { createTicketAction } from "./actions";
import { formatDueDay, formatPriority } from "./format";
import { PeoplePicker } from "./PeoplePicker";
import { TipoRequerimientoFields } from "./TipoRequerimientoFields";

/**
 * Formulario para radicar un ticket propio (T2; rediseñado en U31 según la
 * maqueta aprobada por el usuario el 04-nov-2026).
 *
 * La cascada de tipo de requerimiento vive en `TipoRequerimientoFields`,
 * compartida con la clasificación de tickets del portal (T3); aquí, con las
 * áreas como tarjetas. Lo que se envía es solo el tipo resuelto: el área y el
 * responsable los decide la base (`helpdesk.crear_ticket_interno`), no el
 * formulario.
 *
 * Al elegir el área, la ventana entera toma su color y dice a quién llegará
 * (`useFormDialogTone`): antes de escribir se ve a quién se le escribe. La prioridad va en tarjetas con el día en que
 * vencería el ticket, que calcula la misma función que fija el plazo.
 *
 * Si la creación falla, el formulario vuelve con lo que se había elegido y
 * escrito. Si sale bien, en lugar del formulario aparece la confirmación con
 * el código y quién lo recibió; «Crear otro» empieza de nuevo.
 *
 * Los observadores (U11) van plegados: son opcionales, y la mayoría de los
 * tickets no los necesita. Si el intento fallido traía alguno, el panel se
 * abre para que se vea lo que se había elegido.
 */
type Props = {
  catalog: CreationCatalog;
  followCandidates: readonly FollowCandidate[];
  maxObservers: number;
};

export function CreateTicketForm(props: Props) {
  // Cambiar la clave remonta el formulario entero: «Crear otro» empieza con
  // el estado de la acción, la cascada y los adjuntos vacíos.
  const [round, setRound] = useState(0);
  return <CreateTicketRound key={round} {...props} onCreateAnother={() => setRound((value) => value + 1)} />;
}

function CreateTicketRound({ catalog, followCandidates, maxObservers, onCreateAnother }: Props & { onCreateAnother: () => void }) {
  const [state, formAction, pending] = useActionState(createTicketAction, IDLE_FORM_STATE);
  const [uploading, setUploading] = useState(false);
  const failed = state.status === "error" ? state : null;
  const initialArea = catalog.areas.find(
    (area) => area.idArea === catalog.tipos.find((tipo) => tipo.idTipoReq === failed?.values.idTipoReq)?.idArea,
  );
  const [areaName, setAreaName] = useState<string | null>(initialArea?.nombre ?? null);
  // Dentro de la ventana emergente, «Cancelar» la cierra y el diálogo ya es la
  // superficie; en la página completa, «Cancelar» vuelve a la bandeja.
  const closeDialog = useFormDialogClose();
  // U31: en la ventana, el área elegida tiñe la ventana entera (encabezado,
  // franja y acento); en la página completa, el propio formulario.
  const setTone = useFormDialogTone();
  const chooseArea = (nombre: string | null) => {
    setAreaName(nombre);
    setTone?.(nombre ? { area: areaThemeKey(nombre), subtitle: `Llegará a ${areaDisplayName(nombre)}` } : null);
  };

  if (state.status === "created") {
    return (
      <div className={closeDialog ? undefined : surface({ padded: false })}>
        <CreatedTicket
          state={state}
          onCreateAnother={() => {
            setTone?.(null);
            onCreateAnother();
          }}
        />
      </div>
    );
  }

  const describedBy = (field: string) => (failed?.fieldErrors[field] ? `${field}-error` : undefined);

  return (
    <form
      action={formAction}
      data-area={!closeDialog && areaName ? areaThemeKey(areaName) : undefined}
      className={closeDialog ? undefined : surface({ padded: false })}
      noValidate
    >
      <div className="space-y-6 p-5 lg:p-7">
        {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}

        <TipoRequerimientoFields
          // La clave remonta la cascada con la selección del intento fallido.
          key={failed?.values.idTipoReq ?? "inicial"}
          catalog={catalog}
          initialIdTipoReq={failed?.values.idTipoReq}
          error={failed?.fieldErrors.idTipoReq}
          areaPicker="cards"
          onAreaChange={chooseArea}
        />

        <fieldset>
          <legend className={fieldLabel}>Prioridad</legend>
          <p className={fieldHint}>El plazo empieza a contar hoy, en días hábiles.</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {catalog.prioridades.map((prioridad) => (
              <label
                key={prioridad.nombre}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-card border-2 border-line bg-surface px-4 py-3 hover:border-line-strong",
                  "has-checked:border-accent has-checked:bg-accent-surface",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid has-focus-visible:outline-focus",
                  colorTransition,
                )}
              >
                <input
                  type="radio"
                  name="prioridad"
                  value={prioridad.nombre}
                  defaultChecked={(failed?.values.prioridad ?? "MEDIA") === prioridad.nombre}
                  className="sr-only"
                />
                <span>
                  <span className="block font-bold text-heading">{formatPriority(prioridad.nombre)}</span>
                  <span className="block text-sm text-ink-muted">{prioridad.diasSla} días hábiles</span>
                </span>
                {prioridad.vence && (
                  <span className="text-right text-sm text-ink-muted">
                    Vence <span className="block font-bold text-heading">{formatDueDay(prioridad.vence)}</span>
                  </span>
                )}
              </label>
            ))}
          </div>
          {failed?.fieldErrors.prioridad && <p className={fieldError}>{failed.fieldErrors.prioridad}</p>}
        </fieldset>

        <div>
          <label htmlFor="descripcion" className={fieldLabel}>Descripción</label>
          <p id="descripcion-hint" className={fieldHint}>Qué necesitas y cualquier dato que ayude a resolverlo.</p>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={5}
            defaultValue={failed?.values.descripcion ?? ""}
            className={cn(fieldControl({ invalid: Boolean(failed?.fieldErrors.descripcion), multiline: true }), "mt-2")}
            aria-invalid={Boolean(failed?.fieldErrors.descripcion) || undefined}
            aria-describedby={cn("descripcion-hint", describedBy("descripcion"))}
          />
          {failed?.fieldErrors.descripcion && (
            <p id="descripcion-error" className={fieldError}>{failed.fieldErrors.descripcion}</p>
          )}
        </div>

        <AttachmentPicker onBusyChange={setUploading} error={failed?.fieldErrors.adjuntos} />

        <details
          className="rounded-card border border-line px-4 py-3"
          open={Boolean(failed?.values.idObservadores || failed?.fieldErrors.idObservadores)}
        >
          <summary className={cn("cursor-pointer rounded-control font-bold text-heading", focusRing)}>
            Observadores <span className="font-normal text-ink-muted">(opcional)</span>
          </summary>
          <div className="mt-3">
            <PeoplePicker
              name="idObservadores"
              label="Personas que deben seguir este ticket"
              hint="Lo podrán consultar y recibirán aviso al crearlo y cuando se responda o se rechace. No lo atienden."
              candidates={followCandidates}
              mode="multiple"
              max={maxObservers}
              initialSelected={failed?.values.idObservadores ? failed.values.idObservadores.split(",") : []}
              error={failed?.fieldErrors.idObservadores}
            />
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 lg:px-7">
        <p className="mr-auto text-sm text-ink-muted">{areaName ? `Lo recibe ${areaDisplayName(areaName)}.` : "Elige el área que atiende para continuar."}</p>
        {closeDialog ? (
          <button type="button" onClick={closeDialog} className={buttonRecipe({ variant: "secondary", size: "lg" })}>Cancelar</button>
        ) : (
          <Link href="/tickets" className={buttonRecipe({ variant: "secondary", size: "lg" })}>Cancelar</Link>
        )}
        <button type="submit" className={buttonRecipe({ variant: "primary", size: "lg" })} disabled={pending || uploading}>
          <Send aria-hidden className="size-4.5" strokeWidth={iconStroke.regular} />
          {pending ? "Creando…" : uploading ? "Subiendo adjuntos…" : "Crear ticket"}
        </button>
      </div>
    </form>
  );
}

/**
 * Confirmación de un ticket recién creado (U31): qué pasó, a quién le llegó,
 * el código grande para copiarlo o dictarlo, y los dos caminos siguientes.
 * Reemplaza al aviso que salía en el detalle: el código es lo que la persona
 * necesita a mano, y un aviso que se va no se puede copiar.
 */
function CreatedTicket({
  state,
  onCreateAnother,
}: {
  state: Extract<TicketFormState, { status: "created" }>;
  onCreateAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!state.codigo) return;
    try {
      await navigator.clipboard.writeText(state.codigo);
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles: el código sigue a la vista para copiarlo a mano.
    }
  };

  return (
    <div data-area={state.area ? areaThemeKey(state.area) : undefined} className="px-6 py-10 text-center">
      <CircleCheck aria-hidden className="mx-auto size-16 animate-rise text-success" strokeWidth={iconStroke.light} />
      <h3 className="mt-4 text-xl font-black tracking-tight text-heading">Ticket creado</h3>
      <p className="mx-auto mt-1.5 max-w-md text-md text-ink-muted">
        {state.area ? `Llegó a ${areaDisplayName(state.area)}` : "Llegó a su área"}
        {state.responsable ? (
          <>
            {" "}y quedó asignado a <strong className="font-bold text-ink">{state.responsable}</strong>.
          </>
        ) : (
          "."
        )}
      </p>
      {state.warning && <p className={cn(notice("warning"), "mx-auto mt-4 max-w-md text-left")}>{state.warning}</p>}

      {state.codigo && (
        <div className="mt-6 inline-flex animate-rise items-center gap-4 rounded-card border-2 border-accent bg-accent-surface py-3 pr-3 pl-5">
          <span className="text-left">
            <span className="block text-sm text-ink-muted">Código</span>
            <span className="block text-2xl font-black tabular-nums tracking-wide text-heading">{state.codigo}</span>
          </span>
          <button type="button" onClick={copy} className={buttonRecipe({ variant: "primary" })}>
            <Copy aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
            <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onCreateAnother} className={buttonRecipe({ variant: "secondary", size: "lg" })}>
          Crear otro
        </button>
        <Link href={`/tickets/${state.idTicket}`} className={buttonRecipe({ variant: "primary", size: "lg" })}>
          Ver el ticket
        </Link>
      </div>
    </div>
  );
}

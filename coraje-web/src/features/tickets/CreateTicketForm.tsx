"use client";

import { ChevronDown, CircleCheck, Copy, Send, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useFormDialogClose, useFormDialogTone } from "@/design-system/patterns/form-dialog/FormDialog";
import { iconStroke } from "@/design-system/foundations/iconography";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldLabel } from "@/design-system/recipes/field";
import { colorTransition } from "@/design-system/recipes/interaction";
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
 * áreas como chips. Lo que se envía es solo el tipo resuelto: el área y el
 * responsable los decide la base (`helpdesk.crear_ticket_interno`), no el
 * formulario.
 *
 * Al elegir el área, la ventana entera toma su color y dice a quién llegará
 * (`useFormDialogTone`): antes de escribir se ve a quién se le escribe. La
 * prioridad va en una fila de opciones con el día en que vencería el ticket,
 * que calcula la misma función que fija el plazo.
 *
 * U33 compactó la forma (pedido del usuario: en un portátil la ventana pedía
 * desplazarse casi el doble de su alto): áreas en chips, prioridad en una
 * fila, ayudas en la línea de su etiqueta, y adjuntos y observadores como dos
 * botones en una fila, con los archivos en chips y el número de observadores
 * en el botón.
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
  // Observadores (U11): plegados, porque la mayoría de los tickets no los
  // necesita; si el intento fallido traía alguno o un error, el panel se abre.
  const initialObservers = failed?.values.idObservadores ? failed.values.idObservadores.split(",") : [];
  const [observersOpen, setObserversOpen] = useState(initialObservers.length > 0 || Boolean(failed?.fieldErrors.idObservadores));
  const [observerCount, setObserverCount] = useState(initialObservers.length);
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
      <div className="space-y-5 p-5 lg:p-6">
        {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}

        <TipoRequerimientoFields
          // La clave remonta la cascada con la selección del intento fallido.
          key={failed?.values.idTipoReq ?? "inicial"}
          catalog={catalog}
          initialIdTipoReq={failed?.values.idTipoReq}
          error={failed?.fieldErrors.idTipoReq}
          areaPicker="chips"
          onAreaChange={chooseArea}
        />

        {/* U33: una fila de opciones del mismo ancho, en lugar de tarjetas
            de dos líneas en dos columnas. En móvil, cada opción parte el
            nombre y el día en dos líneas para caber las tres. */}
        <fieldset aria-describedby={failed?.fieldErrors.prioridad ? "prioridad-error" : undefined}>
          <legend className={fieldLabel}>
            Prioridad <span className="font-normal text-ink-muted">· plazo en días hábiles desde hoy</span>
          </legend>
          <div className="mt-2 grid auto-cols-fr grid-flow-col gap-2">
            {catalog.prioridades.map((prioridad) => (
              <label
                key={prioridad.nombre}
                className={cn(
                  "flex min-w-0 cursor-pointer flex-col rounded-control border-2 border-line bg-surface px-3 py-1.5 hover:border-line-strong",
                  "sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5",
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
                <span className="font-bold text-heading">{formatPriority(prioridad.nombre)}</span>
                <span className="text-sm text-ink-muted">
                  {prioridad.vence ? (
                    <>
                      <span className="hidden sm:inline">{prioridad.diasSla} días · </span>vence {formatDueDay(prioridad.vence)}
                    </>
                  ) : (
                    `${prioridad.diasSla} días`
                  )}
                </span>
              </label>
            ))}
          </div>
          {failed?.fieldErrors.prioridad && <p id="prioridad-error" className={fieldError}>{failed.fieldErrors.prioridad}</p>}
        </fieldset>

        <div>
          {/* La ayuda va en la línea de la etiqueta: así no suma una fila. */}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <label htmlFor="descripcion" className={fieldLabel}>Descripción</label>
            <p id="descripcion-hint" className="text-sm text-ink-muted">Qué necesitas y cualquier dato que ayude a resolverlo.</p>
          </div>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={4}
            defaultValue={failed?.values.descripcion ?? ""}
            className={fieldControl({ invalid: Boolean(failed?.fieldErrors.descripcion), multiline: true })}
            aria-invalid={Boolean(failed?.fieldErrors.descripcion) || undefined}
            aria-describedby={cn("descripcion-hint", describedBy("descripcion"))}
          />
          {failed?.fieldErrors.descripcion && (
            <p id="descripcion-error" className={fieldError}>{failed.fieldErrors.descripcion}</p>
          )}
        </div>

        {/* Adjuntos y observadores son opcionales: un botón cada uno en la
            misma fila, y lo elegido se ve sin abrir nada (chips y contador). */}
        <div>
          <AttachmentPicker
            layout="compact"
            onBusyChange={setUploading}
            error={failed?.fieldErrors.adjuntos}
            trailing={
              <button
                type="button"
                aria-expanded={observersOpen}
                aria-controls="observadores-panel"
                onClick={() => setObserversOpen((open) => !open)}
                className={buttonRecipe({ variant: "secondary" })}
              >
                <Users aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
                Observadores
                {observerCount > 0 && (
                  <span className="rounded-pill bg-accent-surface px-1.5 text-sm font-bold text-heading">
                    {observerCount}
                    <span className="sr-only"> elegidos</span>
                  </span>
                )}
                <ChevronDown aria-hidden className={cn("size-4", observersOpen && "rotate-180")} strokeWidth={iconStroke.regular} />
              </button>
            }
          />
          {/* Plegado con `hidden`, no desmontado: las personas elegidas se
              siguen enviando con el panel cerrado. */}
          <div id="observadores-panel" hidden={!observersOpen} className="mt-3 rounded-card border border-line p-4">
            <PeoplePicker
              name="idObservadores"
              label="Personas que deben seguir este ticket"
              hint="Lo podrán consultar y recibirán aviso al crearlo y cuando se responda o se rechace. No lo atienden."
              candidates={followCandidates}
              mode="multiple"
              max={maxObservers}
              initialSelected={initialObservers}
              error={failed?.fieldErrors.idObservadores}
              onSelectionChange={setObserverCount}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 lg:px-6">
        <p
          className={cn(
            "mr-auto text-sm text-ink-muted",
            // En la ventana, con el área elegida, el encabezado ya dice «Llegará
            // a …»: en móvil se omite aquí para que el pie quepa en una fila.
            closeDialog && areaName && "hidden sm:block",
          )}
        >
          {areaName ? `Lo recibe ${areaDisplayName(areaName)}.` : "Elige el área que atiende para continuar."}
        </p>
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
      <h3 className="mt-4 text-xl font-bold tracking-tight text-heading">Ticket creado</h3>
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
            <span className="block text-2xl font-bold tabular-nums tracking-wide text-heading">{state.codigo}</span>
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

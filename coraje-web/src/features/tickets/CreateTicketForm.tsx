"use client";

import { CircleCheck, Copy, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";

import heroGlobe from "../../../public/rb-isotype-white-hero.png";
import { useFormDialogClose } from "@/design-system/patterns/form-dialog/FormDialog";
import { iconStroke } from "@/design-system/foundations/iconography";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { colorTransition, focusRing } from "@/design-system/recipes/interaction";
import { notice, surface } from "@/design-system/recipes/surface";
import { helpdeskTheme } from "@/design-system/themes/helpdesk";
import { cn } from "@/design-system/utilities/cn";
import { areaThemeKey } from "@/features/areas/area-theme";
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
 * Arriba, una franja que toma el color del área elegida: antes de escribir se
 * ve a quién se le escribe. La prioridad va en tarjetas con el día en que
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

  if (state.status === "created") {
    return (
      <div className={closeDialog ? undefined : surface({ padded: false })}>
        <CreatedTicket state={state} onCreateAnother={onCreateAnother} />
      </div>
    );
  }

  const describedBy = (field: string) => (failed?.fieldErrors[field] ? `${field}-error` : undefined);

  return (
    <form action={formAction} className={closeDialog ? undefined : surface({ padded: false })} noValidate>
      <AreaBand areaName={areaName} />
      <div className="space-y-6 p-5 lg:p-7">
        {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}

        <TipoRequerimientoFields
          // La clave remonta la cascada con la selección del intento fallido.
          key={failed?.values.idTipoReq ?? "inicial"}
          catalog={catalog}
          initialIdTipoReq={failed?.values.idTipoReq}
          error={failed?.fieldErrors.idTipoReq}
          areaPicker="cards"
          onAreaChange={setAreaName}
        />

        <fieldset>
          <legend className={fieldLabel}>Prioridad</legend>
          <p className={fieldHint}>El plazo empieza a contar hoy, en días hábiles.</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {catalog.prioridades.map((prioridad) => (
              <label
                key={prioridad.nombre}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-card border-2 border-line bg-surface px-4 py-3.5 hover:border-line-strong",
                  "has-checked:border-heading has-checked:bg-surface-sunken",
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
                  <span className="block text-md font-black text-heading">{formatPriority(prioridad.nombre)}</span>
                  <span className="block text-ink-muted">{prioridad.diasSla} días hábiles</span>
                </span>
                {prioridad.vence && (
                  <span className="text-right">
                    <span className="block text-xs font-black uppercase tracking-widest text-ink-muted">Vence</span>
                    <span className="block font-black text-heading">{formatDueDay(prioridad.vence)}</span>
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
          <summary className={cn("cursor-pointer rounded-control font-black text-heading", focusRing)}>
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
        <p className="mr-auto text-sm text-ink-muted">{areaName ? `Lo recibe ${areaName}.` : "Elige el área que atiende para continuar."}</p>
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
 * La franja de arriba del formulario (U31). Con un área elegida, toma su
 * color —`data-area` redefine el acento, como en el shell (U16)— y dice a
 * quién llegará el ticket, con el motivo del globo de la cabecera de la
 * bandeja. Sin área, es neutra. El globo es decorativo.
 */
function AreaBand({ areaName }: { areaName: string | null }) {
  // La franja mide unos 90 px: el globo va al tamaño del disco interior del
  // estado vacío, que deja aire dentro del semicírculo.
  const globe = Number.parseFloat(helpdeskTheme.size.emptyMarkInner);
  return (
    <div
      data-area={areaName ? areaThemeKey(areaName) : undefined}
      className={cn("relative overflow-hidden", areaName ? "bg-accent-surface" : "bg-surface-sunken", colorTransition)}
    >
      <div aria-hidden="true" className={cn("h-hero-stripe", areaName ? "bg-accent" : "bg-line", colorTransition)} />
      {areaName && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden aspect-square translate-x-1/8 animate-hero-mark place-items-center rounded-l-pill bg-accent sm:grid"
        >
          <Image src={heroGlobe} alt="" width={globe} height={globe} className="size-empty-mark-inner" />
        </div>
      )}
      <div className="relative px-5 py-4 lg:px-7">
        <p className="text-xs font-black uppercase tracking-widest text-ink-muted">{areaName ? "Llegará a" : "Antes de escribir"}</p>
        <p className="mt-0.5 text-xl font-black tracking-tight text-heading">{areaName ?? "Elige a quién le escribes"}</p>
      </div>
    </div>
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
        {state.area ? `Llegó a ${state.area}` : "Llegó a su área"}
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
            <span className="block text-xs font-black uppercase tracking-widest text-ink-muted">Código</span>
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

"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { notice, surface } from "@/design-system/recipes/surface";
import { focusRing } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";
import type { CreationCatalog, FollowCandidate } from "@/server/tickets/ticket-queries";

import { IDLE_FORM_STATE } from "./action-state";
import { createTicketAction } from "./actions";
import { formatPriority } from "./format";
import { PeoplePicker } from "./PeoplePicker";
import { TipoRequerimientoFields } from "./TipoRequerimientoFields";

/**
 * Formulario para radicar un ticket propio (T2).
 *
 * La cascada de tipo de requerimiento vive en `TipoRequerimientoFields`,
 * compartida con la clasificación de tickets del portal (T3). Lo que se envía
 * es solo el tipo resuelto: el área y el responsable los decide la base
 * (`helpdesk.crear_ticket_interno`), no el formulario.
 *
 * Si la creación falla, el formulario vuelve con lo que se había elegido y
 * escrito.
 *
 * Los observadores (U11) van plegados: son opcionales, y la mayoría de los
 * tickets no los necesita. Si el intento fallido traía alguno, el panel se
 * abre para que se vea lo que se había elegido.
 */
export function CreateTicketForm({
  catalog,
  followCandidates,
  maxObservers,
}: {
  catalog: CreationCatalog;
  followCandidates: readonly FollowCandidate[];
  maxObservers: number;
}) {
  const [state, formAction, pending] = useActionState(createTicketAction, IDLE_FORM_STATE);
  const failed = state.status === "error" ? state : null;

  const describedBy = (field: string) => (failed?.fieldErrors[field] ? `${field}-error` : undefined);

  return (
    <form action={formAction} className={surface()} noValidate>
      <div className="space-y-5">
        {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}

        <TipoRequerimientoFields
          // La clave remonta la cascada con la selección del intento fallido.
          key={failed?.values.idTipoReq ?? "inicial"}
          catalog={catalog}
          initialIdTipoReq={failed?.values.idTipoReq}
          error={failed?.fieldErrors.idTipoReq}
        />

        <fieldset>
          <legend className={fieldLabel}>Prioridad</legend>
          <p className={fieldHint}>El plazo de respuesta empieza a contar hoy, en días hábiles.</p>
          <div className="mt-2 flex flex-wrap gap-4">
            {catalog.prioridades.map((prioridad) => (
              <label key={prioridad.nombre} className="inline-flex items-center gap-2 text-base text-ink">
                <input
                  type="radio"
                  name="prioridad"
                  value={prioridad.nombre}
                  defaultChecked={(failed?.values.prioridad ?? "MEDIA") === prioridad.nombre}
                  className="size-4 accent-action"
                />
                {formatPriority(prioridad.nombre, prioridad.diasSla)}
              </label>
            ))}
          </div>
          {failed?.fieldErrors.prioridad && <p className={fieldError}>{failed.fieldErrors.prioridad}</p>}
        </fieldset>

        <div>
          <label htmlFor="descripcion" className={fieldLabel}>Descripción</label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={6}
            defaultValue={failed?.values.descripcion ?? ""}
            className={fieldControl({ invalid: Boolean(failed?.fieldErrors.descripcion), multiline: true })}
            aria-invalid={Boolean(failed?.fieldErrors.descripcion) || undefined}
            aria-describedby={describedBy("descripcion") ?? "descripcion-hint"}
          />
          {failed?.fieldErrors.descripcion ? (
            <p id="descripcion-error" className={fieldError}>{failed.fieldErrors.descripcion}</p>
          ) : (
            <p id="descripcion-hint" className={fieldHint}>Qué necesitas y cualquier dato que ayude a resolverlo.</p>
          )}
        </div>

        <details
          className="rounded-control border border-line px-4 py-3"
          open={Boolean(failed?.values.idObservadores || failed?.fieldErrors.idObservadores)}
        >
          <summary className={cn("cursor-pointer rounded-control font-bold text-heading", focusRing)}>
            Observadores (opcional)
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

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className={buttonRecipe({ variant: "primary" })} disabled={pending}>
            {pending ? "Creando…" : "Crear ticket"}
          </button>
          <Link href="/tickets" className={buttonRecipe({ variant: "secondary" })}>Cancelar</Link>
        </div>
      </div>
    </form>
  );
}

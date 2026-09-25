"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { notice, surface } from "@/design-system/recipes/surface";
import type { CreationCatalog } from "@/server/tickets/ticket-queries";

import { IDLE_FORM_STATE } from "./action-state";
import { createTicketAction } from "./actions";
import { formatPriority } from "./format";

/**
 * Formulario para radicar un ticket propio (T2).
 *
 * La cascada área → tipo → categoría 1 → categoría 2 se resuelve en el
 * navegador sobre el catálogo completo, porque son unas decenas de filas y
 * pedirlas por partes costaría una ida al servidor por cada selección. Lo que
 * se envía es solo el tipo de requerimiento resuelto: el área y el
 * responsable los decide la base (`helpdesk.crear_ticket_interno`), no el
 * formulario.
 *
 * Si la creación falla, el formulario vuelve con lo que se había elegido y
 * escrito.
 */
type Tipo = CreationCatalog["tipos"][number];

/** `null` de categoría se representa como cadena vacía en los `<select>`. */
const key = (value: string | null) => value ?? "";

function distinct(values: (string | null)[]): (string | null)[] {
  return [...new Set(values.map(key))].map((value) => (value === "" ? null : value));
}

export function CreateTicketForm({ catalog }: { catalog: CreationCatalog }) {
  const [state, formAction, pending] = useActionState(createTicketAction, IDLE_FORM_STATE);
  const failed = state.status === "error" ? state : null;

  // Si la acción falló, la selección se reconstruye a partir del tipo enviado.
  const previous = catalog.tipos.find((tipo) => tipo.idTipoReq === failed?.values.idTipoReq);
  const [idArea, setIdArea] = useState(previous?.idArea ?? "");
  const [tipo, setTipo] = useState(previous?.tipo ?? "");
  const [categoria1, setCategoria1] = useState(key(previous?.categoria1 ?? null));
  const [categoria2, setCategoria2] = useState(key(previous?.categoria2 ?? null));

  const inArea = useMemo(() => catalog.tipos.filter((row) => row.idArea === idArea), [catalog.tipos, idArea]);
  const inTipo = useMemo(() => inArea.filter((row) => row.tipo === tipo), [inArea, tipo]);
  const categorias1 = useMemo(() => distinct(inTipo.map((row) => row.categoria1)), [inTipo]);
  const inCategoria1 = useMemo(() => inTipo.filter((row) => key(row.categoria1) === categoria1), [inTipo, categoria1]);
  const categorias2 = useMemo(() => distinct(inCategoria1.map((row) => row.categoria2)), [inCategoria1]);

  // Una categoría que solo tiene el valor vacío no se pregunta: no hay nada
  // que elegir.
  const askCategoria1 = categorias1.some((value) => value !== null);
  const askCategoria2 = categorias2.some((value) => value !== null);

  const resolved: Tipo | undefined = inCategoria1.find((row) => key(row.categoria2) === categoria2);

  const tipos = useMemo(() => [...new Set(inArea.map((row) => row.tipo))], [inArea]);

  const describedBy = (field: string) => (failed?.fieldErrors[field] ? `${field}-error` : undefined);

  return (
    <form action={formAction} className={surface()} noValidate>
      <div className="space-y-5">
        {failed && <p className={notice("danger")} role="alert">{failed.message}</p>}

        <div>
          <label htmlFor="area" className={fieldLabel}>Área que atiende</label>
          <select
            id="area"
            className={fieldControl()}
            value={idArea}
            onChange={(event) => {
              setIdArea(event.target.value);
              setTipo("");
              setCategoria1("");
              setCategoria2("");
            }}
          >
            <option value="">Elige un área</option>
            {catalog.areas.map((area) => (
              <option key={area.idArea} value={area.idArea}>{area.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tipo" className={fieldLabel}>Tipo de requerimiento</label>
          <select
            id="tipo"
            className={fieldControl({ invalid: Boolean(failed?.fieldErrors.idTipoReq) })}
            value={tipo}
            disabled={!idArea}
            aria-invalid={Boolean(failed?.fieldErrors.idTipoReq) || undefined}
            aria-describedby={describedBy("idTipoReq")}
            onChange={(event) => {
              setTipo(event.target.value);
              setCategoria1("");
              setCategoria2("");
            }}
          >
            <option value="">{idArea ? "Elige un tipo" : "Primero elige un área"}</option>
            {tipos.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          {failed?.fieldErrors.idTipoReq && (
            <p id="idTipoReq-error" className={fieldError}>Elige el tipo y las categorías del requerimiento.</p>
          )}
        </div>

        {tipo && askCategoria1 && (
          <div>
            <label htmlFor="categoria1" className={fieldLabel}>Categoría</label>
            <select
              id="categoria1"
              className={fieldControl()}
              value={categoria1}
              onChange={(event) => {
                setCategoria1(event.target.value);
                setCategoria2("");
              }}
            >
              <option value="">Elige una categoría</option>
              {categorias1.map((value) => (
                <option key={key(value)} value={key(value)}>{value ?? "Sin categoría"}</option>
              ))}
            </select>
          </div>
        )}

        {tipo && askCategoria2 && (
          <div>
            <label htmlFor="categoria2" className={fieldLabel}>Subcategoría</label>
            <select id="categoria2" className={fieldControl()} value={categoria2} onChange={(event) => setCategoria2(event.target.value)}>
              <option value="">Elige una subcategoría</option>
              {categorias2.map((value) => (
                <option key={key(value)} value={key(value)}>{value ?? "Sin subcategoría"}</option>
              ))}
            </select>
          </div>
        )}

        <input type="hidden" name="idTipoReq" value={resolved?.idTipoReq ?? ""} />

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

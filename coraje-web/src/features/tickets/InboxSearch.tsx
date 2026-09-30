"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldLabel } from "@/design-system/recipes/field";
import { TICKET_STATES, TICKET_STATE_LABEL } from "@/server/tickets/ticket-state";

/**
 * Búsqueda y filtro de la bandeja, aplicados mientras se escribe.
 *
 * Cada cambio reemplaza la URL (`router.replace`) y la bandeja se vuelve a
 * leer en el servidor, con el mismo filtro SQL de siempre: la página no filtra
 * filas en el navegador, porque solo tiene la página actual y no todo el
 * alcance (CLAUDE.md, «la base hace el trabajo de la base»).
 *
 * - **Texto:** espera una pausa corta antes de consultar, para no pedir una
 *   bandeja por cada tecla.
 * - **Estado:** se aplica al elegirlo.
 * - **Sin JavaScript** sigue siendo un formulario GET (`next/form`): Enter
 *   busca, igual que antes.
 *
 * `replace` y no `push`: cada letra no es una página a la que volver con el
 * botón atrás. La página vuelve a la 1, porque la anterior puede no existir
 * con el filtro nuevo.
 */

/** Pausa tras la última tecla antes de consultar. */
const SEARCH_DEBOUNCE_MS = 350;

export function InboxSearch({
  view,
  texto,
  estado,
  showEstado,
  maxLength,
  clearHref,
}: {
  view: string;
  texto: string | null;
  estado: string | null;
  /** Falso en la vista que ya fija el estado («Por atender»). */
  showEstado: boolean;
  maxLength: number;
  clearHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(texto ?? "");
  // Local para que el selector cambie al instante, sin esperar a que el
  // servidor devuelva la bandeja filtrada.
  const [estadoValue, setEstadoValue] = useState(estado ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lo último que esta caja pidió. Si la URL cambia por otro camino
  // («Limpiar filtros», otra pestaña), la caja se alinea con ella; si el
  // cambio lo pidió la propia caja, no se toca lo que la persona sigue
  // escribiendo.
  const [lastRequested, setLastRequested] = useState(texto ?? "");
  const [prevProps, setPrevProps] = useState({ texto, estado });

  // Ajuste durante el render y no en un efecto (patrón de React para
  // «estado derivado de una prop que cambia»): un efecto pintaría primero el
  // valor viejo y después el nuevo.
  if (prevProps.texto !== texto || prevProps.estado !== estado) {
    setPrevProps({ texto, estado });
    if (prevProps.estado !== estado) setEstadoValue(estado ?? "");
    const fromUrl = texto ?? "";
    if (prevProps.texto !== texto && fromUrl !== lastRequested) {
      setLastRequested(fromUrl);
      setValue(fromUrl);
    }
  }

  function cancelPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => cancelPending, []);

  function navigate(next: { texto: string; estado: string | null }) {
    const query = new URLSearchParams({ vista: view });
    const trimmed = next.texto.trim();
    if (trimmed) query.set("q", trimmed);
    if (next.estado) query.set("estado", next.estado);
    setLastRequested(trimmed);
    startTransition(() => router.replace(`/tickets?${query.toString()}`, { scroll: false }));
  }

  function onTextChange(nextValue: string) {
    setValue(nextValue);
    cancelPending();
    timer.current = setTimeout(() => navigate({ texto: nextValue, estado: estadoValue || null }), SEARCH_DEBOUNCE_MS);
  }

  const filtering = texto !== null || estado !== null;

  return (
    <Form action="/tickets" role="search" className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <input type="hidden" name="vista" value={view} />
      <div className="min-w-0 flex-1 basis-64">
        <label htmlFor="busqueda" className={fieldLabel}>Buscar</label>
        <input
          id="busqueda"
          name="q"
          type="search"
          value={value}
          onChange={(event) => onTextChange(event.target.value)}
          maxLength={maxLength}
          placeholder="Código, descripción o solicitante"
          autoComplete="off"
          className={fieldControl()}
        />
      </div>
      {showEstado && (
        <div className="basis-48">
          <label htmlFor="estado" className={fieldLabel}>Estado</label>
          <select
            id="estado"
            name="estado"
            value={estadoValue}
            onChange={(event) => {
              cancelPending();
              setEstadoValue(event.target.value);
              navigate({ texto: value, estado: event.target.value || null });
            }}
            className={fieldControl()}
          >
            <option value="">Todos</option>
            {TICKET_STATES.map((state) => (
              <option key={state} value={state}>{TICKET_STATE_LABEL[state]}</option>
            ))}
          </select>
        </div>
      )}
      {filtering && (
        // Cancela la búsqueda pendiente: si no, llegaría después y volvería a
        // poner el texto que se acaba de limpiar.
        <Link href={clearHref} onClick={cancelPending} className={buttonRecipe({ variant: "secondary" })}>
          Limpiar filtros
        </Link>
      )}
    </Form>
  );
}

"use client";

import { useId, useMemo, useState } from "react";

import { fieldControl, fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
import { cn } from "@/design-system/utilities/cn";
import type { FollowCandidate } from "@/server/tickets/ticket-queries";

/**
 * Selector de personas del directorio para el seguimiento (U11): observadores
 * al crear o después, y la persona a la que se pide una validación.
 *
 * Una lista con filtro y no un `<select multiple>`: con más de cien personas,
 * el control nativo obliga a mantener Ctrl pulsado y no deja buscar. Cada
 * opción es un `<input>` nativo con su `name`, así que el formulario envía
 * la selección sin estado paralelo, y un filtro que oculta una persona ya
 * elegida no la desmarca (un campo oculto sigue enviándose).
 *
 * El área acompaña al nombre porque en el directorio hay homónimos.
 */
export function PeoplePicker({
  name,
  label,
  hint,
  candidates,
  mode,
  initialSelected = [],
  error,
  max,
}: {
  name: string;
  label: string;
  hint?: string;
  candidates: readonly FollowCandidate[];
  /** Varias personas (observadores) o una sola (validación). */
  mode: "multiple" | "single";
  initialSelected?: readonly string[];
  error?: string;
  /** Tope de la selección múltiple; el servidor lo vuelve a aplicar. */
  max?: number;
}) {
  const baseId = useId();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelected));

  const normalized = filter.trim().toLocaleLowerCase("es");
  const visible = useMemo(
    () =>
      new Set(
        candidates
          .filter((person) => !normalized || `${person.nombre} ${person.area ?? ""}`.toLocaleLowerCase("es").includes(normalized))
          .map((person) => person.idPersonal),
      ),
    [candidates, normalized],
  );

  const full = mode === "multiple" && max !== undefined && selected.size >= max;

  function toggle(idPersonal: string, checked: boolean) {
    setSelected((current) => {
      if (mode === "single") return new Set(checked ? [idPersonal] : []);
      const next = new Set(current);
      if (checked) next.add(idPersonal);
      else next.delete(idPersonal);
      return next;
    });
  }

  if (candidates.length === 0) {
    return <NoCandidatesNotice />;
  }

  const describedBy = error ? `${baseId}-error` : hint ? `${baseId}-hint` : undefined;

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className={fieldLabel}>{label}</legend>
      {hint && !error && <p id={`${baseId}-hint`} className={fieldHint}>{hint}</p>}
      <label htmlFor={`${baseId}-filtro`} className="sr-only">Buscar persona</label>
      <input
        id={`${baseId}-filtro`}
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Buscar por nombre o área"
        className={fieldControl({ invalid: Boolean(error) })}
        autoComplete="off"
      />
      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line" role="list">
        {candidates.map((person) => {
          const checked = selected.has(person.idPersonal);
          return (
            <li key={person.idPersonal} hidden={!visible.has(person.idPersonal)}>
              <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-sunken", checked && "bg-accent-surface")}>
                <input
                  type={mode === "multiple" ? "checkbox" : "radio"}
                  name={name}
                  value={person.idPersonal}
                  checked={checked}
                  disabled={!checked && full}
                  onChange={(event) => toggle(person.idPersonal, event.target.checked)}
                  className="mt-1 size-4 accent-action"
                />
                <span className="min-w-0">
                  <span className="block text-base text-ink">{person.nombre}</span>
                  {person.area && <span className="block text-sm text-ink-muted">{person.area}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {visible.size === 0 && <p className={fieldHint}>Nadie coincide con «{filter.trim()}».</p>}
      {mode === "multiple" && (
        <p className={fieldHint} aria-live="polite">
          {selected.size === 0
            ? "Nadie elegido."
            : `${selected.size} ${selected.size === 1 ? "persona elegida" : "personas elegidas"}${full ? ` · máximo ${max}` : ""}.`}
        </p>
      )}
      {error && <p id={`${baseId}-error`} className={fieldError}>{error}</p>}
    </fieldset>
  );
}

/**
 * Lo que se muestra cuando no hay a quién elegir. Lo usan también los
 * formularios que envuelven al selector, para no ofrecer un botón que solo
 * puede fallar.
 */
export function NoCandidatesNotice() {
  return <p className="text-base text-ink-muted">No hay otras personas con acceso a HelpDesk para elegir.</p>;
}

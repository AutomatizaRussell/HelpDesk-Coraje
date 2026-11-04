import type { ReactNode } from "react";

import type { BadgeTone } from "../../recipes/badge";
import { modeTransition } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import { CountUp } from "./CountUp";
import { HeroGlobe } from "./HeroGlobe";
import { HeroPointerGrid } from "./HeroPointerGrid";

/**
 * Cabecera del área (U30, design/sistema-helpdesk.md §5.4): la franja de
 * bienvenida de la bandeja, en el color del área de quien entra.
 *
 * Todo el color sale del **acento** que el shell ya redefine por área
 * (`data-area`, U16): fondo en su tinta al 20 %, franja superior y disco en
 * su color pleno, etiqueta del área sobre el color pleno con su tinta legible
 * (`on-accent`). Así este patrón no sabe de áreas, y un área nueva no lo toca.
 *
 * El texto va siempre en navy (`heading`) sobre la tinta, que da ≥ 4,5:1 en
 * las cinco (`area-palette.test.mts`); por eso la cabecera es la tinta y no
 * el color pleno: naranja, Sea Green y Sky Blue no sostienen texto.
 *
 * **La forma con el globo es una pieza aparte a propósito** (`HeroMark`): un
 * semicírculo del alto de la cabecera, pegado al borde derecho, con el globo
 * en su centro. El manual de marca (§4.1) admite el globo como
 * motivo decorativo, blanco, sin girar ni deformar, y lo ilustra sobre fotos
 * recortadas en círculo y sobre fondos sólidos; sobre una forma de color no
 * lo ilustra. Si el área de mercadeo lo objeta, se cambia `HeroMark` y nada
 * más. Por debajo de `lg` la forma se oculta: taparía el saludo.
 */
export type HeroStat = {
  label: string;
  value: number;
  /** Tono del marcador: el del estado que cuenta (`ticket-status.ts`). */
  tone: BadgeTone;
};

/** Marcador de cada cifra, en el color pleno de su tono. */
const MARKER_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-line-strong",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * La forma del área con el globo: un cuadrado tan alto como la cabecera
 * (`inset-y-0` + `aspect-square`) pegado al borde derecho, con las dos
 * esquinas izquierdas redondeadas al máximo. El navegador reduce esos radios
 * a la mitad del alto, así que el lado izquierdo es un **semicírculo** exacto
 * y el derecho queda recto contra el borde. El centro del cuadrado es el
 * centro del semicírculo, y ahí va el globo.
 *
 * Cuarta versión, pedida por el usuario el 04-nov-2026 al ver las anteriores
 * desplegadas: un disco suelto dejaba las esquinas derechas vacías, un arco
 * amplio no se leía como círculo, y un círculo con solo la esquina inferior
 * rellena dejaba vacía la superior.
 */
function HeroMark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 hidden aspect-square animate-hero-mark place-items-center rounded-l-pill bg-accent lg:grid"
    >
      {/* El globo no flota: el flotado es del estado vacío, y repetirlo aquí
          hacía que las dos piezas se leyeran como la misma. Su animación es
          la sorpresa de los cinco clics (`HeroGlobe`). */}
      <HeroGlobe />
    </div>
  );
}

export function AreaHero({
  areaName,
  title,
  summary,
  action,
  stats,
}: {
  /** Nombre del área de quien entra; sin área no se muestra la etiqueta. */
  areaName: string | null;
  /** El saludo. Va en `h2`: el `h1` de la página es el título de la vista. */
  title: string;
  summary: ReactNode;
  /** La acción principal de la vista (crear un ticket), si la hay. */
  action?: ReactNode;
  stats: readonly HeroStat[];
}) {
  return (
    <section aria-label="Resumen" className={cn("relative overflow-hidden bg-accent-surface", modeTransition)}>
      <div aria-hidden="true" className="h-hero-stripe bg-accent" />
      {/* Antes que la forma y el texto: la trama queda por debajo de los dos. */}
      <HeroPointerGrid />
      <div className="relative mx-auto max-w-content px-6 pt-9 pb-14 lg:px-10">
        <div className="max-w-4xl lg:mr-88">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="min-w-0 flex-1 basis-80">
              {areaName && (
                <p className="inline-flex h-6 items-center rounded-pill bg-accent px-2.5 text-xs font-black uppercase tracking-widest text-on-accent">
                  {areaName}
                </p>
              )}
              <h2 className="mt-3 text-3xl font-black tracking-tight text-heading">{title}</h2>
              <p className="mt-2 text-md text-heading">{summary}</p>
            </div>
            {action}
          </div>
          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-card bg-surface/75 px-3.5 py-3">
                <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-ink-muted">
                  <span aria-hidden="true" className={cn("size-2 shrink-0", MARKER_CLASS[stat.tone])} />
                  {stat.label}
                </dt>
                <dd className={cn("mt-1 text-2xl font-black tabular-nums", stat.tone === "danger" && stat.value > 0 ? "text-danger" : "text-heading")}>
                  <CountUp value={stat.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {/* Después del texto a propósito: el bloque del texto ocupa todo el
          ancho y, pintado encima, se quedaría con los clics del globo. La
          forma no tapa nada: el texto le deja libre su espacio (`lg:mr-88`). */}
      <HeroMark />
    </section>
  );
}

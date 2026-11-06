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
  /**
   * La cifra ya escrita, cuando no es un conteo (un porcentaje, un promedio:
   * U39). Se muestra tal cual, sin la animación de conteo, que solo tiene
   * sentido para enteros que crecen desde cero.
   */
  display?: string;
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
 * La forma del área con el globo: un cuadrado tan alto como **toda** la
 * cabecera (también los 60 px sobre los que se monta el contenido), con las
 * dos esquinas izquierdas redondeadas al máximo: el navegador las reduce a la
 * mitad del alto y el lado izquierdo queda como **semicírculo** exacto, cuya
 * curva baja sola hasta el borde inferior. Se corre a la derecha un octavo de
 * su tamaño (`translate-x-1/8`, sobre `translate`, que no choca con el
 * `transform` de la entrada): sale menos hacia el texto y lo que se pierde por
 * el borde es la parte recta, no la curva.
 *
 * El globo no va en el centro del cuadrado sino en el de la **franja
 * visible**: horizontalmente, el centro del semicírculo; verticalmente, la
 * mitad del tramo que queda por encima del contenido (`bottom-15`).
 *
 * **Anclada a la columna, no a la ventana** (05-nov-2026). El texto vive en
 * una columna de ancho máximo centrada; la forma, pegada al borde de la
 * ventana, se separaba de él en un monitor ancho. Ahora el cuadrado se aparta
 * del borde lo que sobra a cada lado de la columna (`right-hero-mark-gutter`,
 * medido con `cqw` sobre este contenedor) y un tramo recto lleva el color
 * hasta el borde. Para que ese tramo no sea un bloque liso, el globo se
 * centra en todo el azul y unos hilos blancos en el ángulo de sus franjas
 * (`.hd-mark-lines`) llenan el lado derecho (variante «16» de la maqueta,
 * elegida por el usuario). Mientras la ventana no supere la columna, el
 * margen es 0 y todo queda como antes.
 *
 * Sexta versión, del 04-nov-2026, tras ver desplegadas las anteriores. La
 * quinta medía el semicírculo solo sobre la franja visible: se veía
 * recortado, y el tramo recto que bajaba desde su punto inferior parecía un
 * poste suelto en lugar de la continuación de la forma.
 */
function HeroMark() {
  return (
    <div aria-hidden="true" className="@container pointer-events-none absolute inset-0 hidden animate-hero-mark lg:block">
      <div className="absolute top-0 right-hero-mark-gutter h-full max-h-hero-mark aspect-square translate-x-1/8 rounded-l-pill bg-accent">
        {/* Tramo recto: desde el centro del cuadrado hasta el borde de la
            ventana. Lo que pasa del borde por `translate-x-1/8` lo recorta la
            cabecera (`overflow-hidden`). */}
        <div className="absolute inset-y-0 left-1/2 -right-hero-mark-gutter bg-accent" />
        {/* El globo se corre la mitad del margen (`hero-mark-shift`): queda en
            el centro de todo el azul visible y no en el del semicírculo, que
            en pantalla ancha ya no es el centro de la forma. Con margen 0 está
            donde siempre. */}
        <div className="absolute top-0 bottom-15 left-hero-mark-shift -right-hero-mark-shift grid place-items-center">
          {/* Hilos: nacen en el centro del globo y van hasta el borde; su
              máscara los abre en un claro alrededor del globo y los apaga
              cuando no sobra margen (`.hd-mark-lines`). Centrados en vertical
              sobre el globo: `-top-15 -bottom-15` compensa el `bottom-15` de
              este bloque. */}
          <div className="hd-mark-lines absolute -top-15 -bottom-15 left-1/2 -right-hero-mark-shift opacity-60" />
          {/* El globo no flota: el flotado es del estado vacío, y repetirlo
              aquí hacía que las dos piezas se leyeran como la misma. Su
              animación es la sorpresa de los cinco clics (`HeroGlobe`). */}
          <HeroGlobe />
        </div>
      </div>
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
      {/* `pb-27` = 48 px de aire bajo las cifras + los 60 px sobre los que se
          monta el contenido (`-mt-15` en los shells): la tinta sigue por
          detrás de la primera tarjeta y el paso al lienzo queda oculto bajo su
          borde, en lugar de cortar la vista en dos. */}
      <div className="relative mx-auto max-w-content px-6 pt-7 pb-27 lg:px-10">
        <div className="max-w-4xl lg:mr-96">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="min-w-0 flex-1 basis-80">
              {areaName && (
                <p className="inline-flex h-6 items-center rounded-pill bg-accent px-2.5 text-xs font-bold text-on-accent">
                  {areaName}
                </p>
              )}
              <h2 className="mt-2.5 text-3xl font-bold tracking-tight text-heading">{title}</h2>
              <p className="mt-1.5 text-md text-heading">{summary}</p>
            </div>
            {action}
          </div>
          {/* La bandeja lleva cuatro cifras (abiertos, asignados, vencidos,
              cerrados) y los indicadores cinco (U39): dos por fila en móvil y
              todas en una fila desde tableta o, con cinco, desde escritorio. */}
          <dl className={cn("mt-5 grid grid-cols-2 gap-3", stats.length > 4 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4")}>
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-card bg-surface/75 px-3.5 py-2.5">
                <dt className="flex items-center gap-2 text-sm text-ink-muted">
                  <span aria-hidden="true" className={cn("size-2 shrink-0", MARKER_CLASS[stat.tone])} />
                  {stat.label}
                </dt>
                <dd className={cn("mt-0.5 text-2xl font-bold tabular-nums", stat.tone === "danger" && stat.value > 0 ? "text-danger" : "text-heading")}>
                  {stat.display ?? <CountUp value={stat.value} />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {/* Después del texto a propósito: el bloque del texto ocupa todo el
          ancho y, pintado encima, se quedaría con los clics del globo. La
          forma no tapa nada: el texto le deja libre su espacio (`lg:mr-96`). */}
      <HeroMark />
    </section>
  );
}

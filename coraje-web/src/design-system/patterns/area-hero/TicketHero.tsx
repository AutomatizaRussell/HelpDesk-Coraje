import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { iconStroke } from "../../foundations/iconography";
import { focusRing, modeTransition } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import type { AreaThemeKey } from "../area/area";
import { PlazoRing } from "./PlazoRing";

/**
 * Cabecera del detalle de un ticket, en el color del **área del ticket** y no
 * en el de quien lo mira: `data-area` propio redefine el acento solo aquí
 * dentro, para que un ticket de Revisoría se vea naranja para todo el que lo
 * abra.
 *
 * U32 (04-nov-2026, maquetas aprobadas «V-3», «X-B» y «W-9»):
 * - **Anillo de plazo** a la derecha (`PlazoRing`) en lugar del semicírculo
 *   de la bandeja: la forma propia del detalle, y la que dice cómo va el
 *   plazo.
 * - **Datos en una tira blanca** con un icono por dato y divisores finos. Sobre
 *   blanco y no sobre la tinta, para que nombres y fechas contrasten; las
 *   columnas se reparten el ancho según lo que llevan (`weight`), sin hueco a
 *   la derecha. El solicitante va primero y con sus iniciales: es el único
 *   dato que es una persona. En pantallas estrechas la tira pasa a rejilla.
 *
 * El contenido se monta sobre su borde inferior como en la bandeja (`pb-27`
 * aquí, `-mt-15` en el shell). El código no es un `h1`: el título de la vista
 * ya lo es, para lector de pantalla.
 */
export type TicketHeroFact = {
  label: string;
  value: ReactNode;
  detail?: string | null;
  alert?: boolean;
  /** Icono del dato; el solicitante lleva `initials` en su lugar. */
  icon?: LucideIcon;
  initials?: string;
  /** Peso de la columna en la tira: cuánto texto suele llevar. */
  weight?: 1 | 2 | 3;
};

const WEIGHT_CLASS = { 1: "xl:grow", 2: "xl:grow-2", 3: "xl:grow-3" } as const;

export function TicketHero({
  area,
  code,
  badges,
  back,
  facts,
  plazo,
}: {
  area: AreaThemeKey;
  code: string;
  /** Área, estado, plazo y origen (`TicketStatusBadges`). */
  badges: ReactNode;
  back: { href: string; label: string };
  facts: readonly TicketHeroFact[];
  /** Fracción del plazo consumida (0–1) y su lectura en texto; `null` sin plazo que medir. */
  plazo: { fraction: number | null; label: string };
}) {
  return (
    <section data-area={area} aria-label="Resumen del ticket" className={cn("relative overflow-hidden bg-accent-surface", modeTransition)}>
      <div aria-hidden="true" className="h-hero-stripe bg-accent" />
      <div className="mx-auto flex max-w-content items-start gap-10 px-6 pt-5 pb-27 lg:px-10">
        <div className="min-w-0 flex-1">
          <Link
            href={back.href}
            className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
          >
            <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
            {back.label}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-heading">{code}</p>
            {badges}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 rounded-card bg-surface px-5 py-4 shadow-raised sm:grid-cols-3 xl:flex xl:gap-0">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className={cn(
                  "flex min-w-0 items-start gap-2.5 xl:basis-0 xl:px-4 xl:first:pl-0 xl:last:pr-0 xl:not-first:border-l xl:not-first:border-line",
                  WEIGHT_CLASS[fact.weight ?? 1],
                )}
              >
                {fact.initials !== undefined ? (
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-pill bg-avatar-surface text-2xs font-bold text-heading"
                  >
                    {fact.initials}
                  </span>
                ) : (
                  fact.icon && <fact.icon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-accent" strokeWidth={iconStroke.regular} />
                )}
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">{fact.label}</dt>
                  <dd className={cn("mt-0.5 font-bold", fact.alert ? "text-danger" : "text-heading")}>
                    {fact.value}
                    {fact.detail && <span className="block text-sm font-normal text-ink-muted">{fact.detail}</span>}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
        <div className="hidden pt-2 lg:block">
          <PlazoRing fraction={plazo.fraction} label={plazo.label} />
        </div>
      </div>
    </section>
  );
}

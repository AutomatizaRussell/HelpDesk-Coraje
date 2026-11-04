import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import heroGlobe from "../../../../public/rb-isotype-white-hero.png";
import { iconStroke } from "../../foundations/iconography";
import { focusRing, modeTransition } from "../../recipes/interaction";
import { HeroDescription } from "./HeroDescription";
import { helpdeskTheme } from "../../themes/helpdesk";
import { cn } from "../../utilities/cn";
import type { AreaThemeKey } from "../area/area";

/**
 * Cabecera del detalle de un ticket (U31, maqueta aprobada «U»): la misma
 * familia que la cabecera de la bandeja (`AreaHero`), en el color del **área
 * del ticket** y no en el de quien lo mira —`data-area` propio redefine el
 * acento solo aquí dentro—, para que un ticket de Revisoría se vea naranja
 * para todo el que lo abra.
 *
 * Lleva el código grande, el estado y el plazo, la descripción (recortada,
 * con «ver completa»: es su único lugar desde U32) y cinco datos en cajitas. El contenido se monta
 * sobre su borde inferior como en la bandeja (`pb-27` aquí, `-mt-15` en el
 * shell). El semicírculo con el globo es el de la bandeja, del mismo tamaño
 * (U32: el globo más pequeño no se leía como señal de otra vista sino como
 * descuido), pero quieto: la sorpresa de los cinco clics es de la bandeja.
 *
 * El código no es un `h1`: el título de la vista ya lo es (en la topbar de
 * Conecta, o para lector de pantalla en la entrada directa).
 */
export type TicketHeroFact = { label: string; value: string; detail?: string | null; alert?: boolean };

const GLOBE = Number.parseFloat(helpdeskTheme.size.heroGlobe);

export function TicketHero({
  area,
  code,
  description,
  badges,
  back,
  facts,
}: {
  area: AreaThemeKey;
  code: string;
  /** La descripción completa; la cabecera la recorta y deja verla entera. */
  description: string;
  /** Estado y plazo (`TicketStatusBadges`). */
  badges: ReactNode;
  back: { href: string; label: string };
  facts: readonly TicketHeroFact[];
}) {
  return (
    <section data-area={area} aria-label="Resumen del ticket" className={cn("relative overflow-hidden bg-accent-surface", modeTransition)}>
      <div aria-hidden="true" className="h-hero-stripe bg-accent" />
      <div className="relative mx-auto max-w-content px-6 pt-5 pb-27 lg:px-10">
        <div className="max-w-5xl lg:mr-88">
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
          <HeroDescription text={description} />
          <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-card bg-surface/75 px-3 py-2.5">
                <dt className="text-xs text-ink-muted">{fact.label}</dt>
                <dd className={cn("mt-0.5 text-base font-bold", fact.alert ? "text-danger" : "text-heading")}>
                  {fact.value}
                  {fact.detail && <span className="block text-sm font-normal text-ink-muted">{fact.detail}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {/* Después del texto, como en la bandeja; aquí no recibe clics. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden animate-hero-mark lg:block">
        <div className="absolute inset-y-0 right-0 aspect-square translate-x-1/8 rounded-l-pill bg-accent">
          <div className="absolute inset-x-0 top-0 bottom-15 grid place-items-center">
            <Image src={heroGlobe} alt="" width={GLOBE} height={GLOBE} className="size-hero-globe" />
          </div>
        </div>
      </div>
    </section>
  );
}

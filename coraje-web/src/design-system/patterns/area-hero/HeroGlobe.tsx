"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import heroGlobe from "../../../../public/rb-isotype-white-hero.png";
import { helpdeskTheme } from "../../themes/helpdesk";
import { cn } from "../../utilities/cn";

/** Clics seguidos que despiertan la sorpresa, y la pausa máxima entre uno y otro. */
const CLICKS_TO_CELEBRATE = 5;
const MAX_PAUSE_MS = 1500;
const CELEBRATE_MS = Number.parseFloat(helpdeskTheme.motion.celebrate);
const GLOBE_SIZE = Number.parseFloat(helpdeskTheme.size.heroGlobe);

/**
 * Las doce chispas, en los colores de la marca: blanco, navy y los cuatro
 * complementarios, dos vueltas. La dirección de cada una la da su posición
 * (`globals.css`, `.hd-spark:nth-child`).
 */
const SPARK_COLORS = [
  "bg-surface",
  "bg-action",
  "bg-area-bpo",
  "bg-area-revisoria",
  "bg-area-general",
  "bg-area-contabilidad",
] as const;
const SPARKS = [...SPARK_COLORS, ...SPARK_COLORS];

/**
 * El globo de la cabecera del área, con su sorpresa (U30, la «S-7» de la
 * maqueta, pedida por el usuario): quien hace clic cinco veces seguidas en él
 * lo ve saltar dos veces y soltar chispas de los colores de la marca. No hace
 * nada más ni cambia nada: es un guiño para quien lo encuentre.
 *
 * Salta en vertical y nunca gira ni se deforma: el manual de marca lo prohíbe
 * para el globo (§4.1). Es decorativo (`aria-hidden` en la forma que lo
 * contiene) y no entra en el orden de tabulación: no es una acción de la
 * aplicación, y anunciarlo como botón confundiría. Con movimiento reducido no
 * hay sorpresa.
 *
 * El contador se reinicia si pasa más de un segundo y medio entre clics, para
 * que cinco clics sueltos a lo largo del día no la disparen por accidente.
 */
export function HeroGlobe() {
  const [burst, setBurst] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const clicks = useRef({ count: 0, last: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = () => {
    const now = performance.now();
    const state = clicks.current;
    state.count = now - state.last <= MAX_PAUSE_MS ? state.count + 1 : 1;
    state.last = now;
    if (state.count < CLICKS_TO_CELEBRATE) return;
    state.count = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // `burst` cambia la `key`: si la sorpresa se repite antes de terminar, el
    // globo y las chispas vuelven a empezar en lugar de seguir a medias.
    setBurst((value) => value + 1);
    setCelebrating(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
  };

  return (
    <div className="pointer-events-auto relative grid place-items-center" onClick={onClick}>
      {celebrating && (
        <span key={burst} className="absolute inset-0">
          {SPARKS.map((color, index) => (
            <span key={index} className={cn("hd-spark", color)} />
          ))}
        </span>
      )}
      <Image
        key={burst}
        src={heroGlobe}
        alt=""
        width={GLOBE_SIZE}
        height={GLOBE_SIZE}
        priority
        draggable={false}
        className={cn("size-hero-globe select-none", celebrating && "animate-hop")}
      />
    </div>
  );
}

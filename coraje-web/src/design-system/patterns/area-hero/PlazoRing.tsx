import Image from "next/image";

import heroGlobe from "../../../../public/rb-isotype-white-hero.png";
import { helpdeskTheme } from "../../themes/helpdesk";

/**
 * Anillo de plazo de la cabecera del detalle (U32, maqueta aprobada «V-3» con
 * la animación «X-B»): el globo blanco en un disco del color del área,
 * rodeado por un anillo que se llena con la parte del plazo ya consumida, en
 * días hábiles.
 *
 * Es la forma propia del detalle: la bandeja tiene el semicírculo pegado al
 * borde; el detalle, este anillo, que además de decorar dice cómo va el
 * plazo.
 *
 * - **Siempre del color del área**, también vencido: entonces el anillo se
 *   cierra, sin pasar a rojo (decisión del usuario, 04-nov-2026). Que está
 *   vencido ya lo dicen en texto la etiqueta y el dato «Plazo».
 * - **Animación** (`globals.css`, `.hd-ring-fill` y `.hd-ring-tip`): el arco
 *   crece desde cero al abrir; lleno, la punta late despacio. Cerrado, no hay
 *   punta.
 * - El SVG usa `pathLength="100"`: el trazo se mide en porcentaje y el
 *   desplazamiento del arco es `100 − porcentaje`, sin calcular la longitud
 *   real de la circunferencia.
 *
 * `fraction` `null`: sin plazo que medir (sin fecha límite, o terminado sin
 * fecha de cierre); se dibuja solo la pista. `label` lo lee el lector de
 * pantalla: el anillo es una imagen con significado, no un adorno.
 */
const GLOBE = Number.parseFloat(helpdeskTheme.size.ringGlobe);

/**
 * Geometría en unidades del `viewBox` (0–100), no en píxeles: escala con
 * `size-plazo-ring`. El anillo ocupa el borde; la punta lleva un trazo fino.
 */
const CENTER = 50;
const RADIUS = 46;
const STROKE = 6;
const TIP_RADIUS = 4.5;
const TIP_STROKE = 2;

export function PlazoRing({ fraction, label }: { fraction: number | null; label: string }) {
  const percent = fraction === null ? 0 : Math.round(fraction * 100);
  // La punta, en el extremo del arco: empieza arriba y avanza en sentido horario.
  const angle = 2 * Math.PI * (percent / 100) - Math.PI / 2;
  const tipX = CENTER + RADIUS * Math.cos(angle);
  const tipY = CENTER + RADIUS * Math.sin(angle);

  return (
    <div role="img" aria-label={label} title={label} className="relative size-plazo-ring shrink-0">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-surface/60" />
        {percent > 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100 100"
            strokeDashoffset={100 - percent}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            className="hd-ring-fill stroke-accent"
          />
        )}
        {fraction !== null && percent < 100 && (
          <circle cx={tipX} cy={tipY} r={TIP_RADIUS} strokeWidth={TIP_STROKE} className="hd-ring-tip fill-surface stroke-accent" />
        )}
      </svg>
      <div className="absolute inset-4 grid place-items-center rounded-pill bg-accent">
        <Image src={heroGlobe} alt="" width={GLOBE} height={GLOBE} className="size-ring-globe" />
      </div>
    </div>
  );
}

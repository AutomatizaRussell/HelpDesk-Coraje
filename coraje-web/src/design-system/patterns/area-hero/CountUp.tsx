"use client";

import { useEffect, useState } from "react";

import { helpdeskTheme } from "../../themes/helpdesk";

/** Duración de la cuenta, del contrato (`motion.count`), en milisegundos. */
const DURATION_MS = Number.parseFloat(helpdeskTheme.motion.count);
const NUMBER = new Intl.NumberFormat("es-CO");

/**
 * Una cifra que cuenta desde cero hasta su valor al abrir la vista (U30).
 *
 * Se hace en JavaScript y no con un contador de CSS porque el contador de CSS
 * no sabe poner el punto de los miles: «2.184» saldría «2184». El servidor
 * pinta el valor final, así que sin JavaScript —o antes de hidratar— la cifra
 * ya es la correcta; la cuenta empieza en el primer cuadro de animación.
 *
 * El lector de pantalla lee solo el valor final (la copia `sr-only`): oír
 * «0, 3, 12, 27» no aporta nada. Con movimiento reducido no hay cuenta.
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / DURATION_MS);
      // Cúbica de salida: rápida al principio, se posa al final.
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{NUMBER.format(shown)}</span>
      <span className="sr-only">{NUMBER.format(value)}</span>
    </>
  );
}

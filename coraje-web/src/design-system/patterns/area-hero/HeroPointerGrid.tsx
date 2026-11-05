"use client";

import { useEffect, useRef } from "react";

/**
 * Trama que sigue al puntero sobre la cabecera del área (U30, elegida por el
 * usuario entre las variantes de la maqueta: la «S-3»). Una trama del color
 * del área aparece solo alrededor del puntero y se apaga al salir. Desde el
 * 05-nov-2026 son rayas finas en el ángulo de las franjas del globo, no
 * puntos, y también va en la cabecera del detalle (`TicketHero`).
 *
 * Escucha el movimiento en su **contenedor** (la cabecera), no en sí misma: es
 * una capa sin eventos (`pointer-events-none`) para no robarle el clic a nada.
 * La posición se escribe como variable CSS en el elemento, una vez por cuadro
 * de animación, sin pasar por el estado de React: seguir al puntero no debe
 * volver a renderizar la cabecera sesenta veces por segundo.
 *
 * Solo con un puntero fino que puede flotar (ratón, trackpad): en una pantalla
 * táctil no hay puntero que seguir. Con movimiento reducido, nada. El aspecto
 * vive en `globals.css` (`.hd-pointer-grid`).
 */
export function HeroPointerGrid() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      layer.style.setProperty("--pointer-x", `${x}px`);
      layer.style.setProperty("--pointer-y", `${y}px`);
    };
    const move = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      x = event.clientX - box.left;
      y = event.clientY - box.top;
      layer.dataset.active = "";
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      delete layer.dataset.active;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <span ref={ref} aria-hidden="true" className="hd-pointer-grid pointer-events-none absolute inset-0" />;
}

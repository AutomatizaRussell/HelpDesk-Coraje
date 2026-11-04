import { Star } from "lucide-react";

import { iconStroke } from "../foundations/iconography";
import { cn } from "../utilities/cn";

/**
 * Calificación de 1 a 5 en estrellas (U32), de solo lectura. Navy y no
 * amarillo: el amarillo no está en la paleta de la marca. Las llenas se
 * distinguen de las vacías por el relleno, no solo por el color, y el valor va
 * en texto para lector de pantalla.
 */
export function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn("size-4", index < value ? "fill-heading text-heading" : "text-line-strong")}
          strokeWidth={iconStroke.regular}
        />
      ))}
      <span className="sr-only">
        {value} de {max}
      </span>
    </span>
  );
}

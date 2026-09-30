import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { iconStroke } from "../foundations/iconography";
import { colorTransition, focusRing } from "../recipes/interaction";
import { cn } from "../utilities/cn";

/**
 * Botón que solo muestra un icono: el + de «Añadir observadores», el lápiz de
 * «Cambiar responsable», la × de «Retirar». Acción terciaria: sin superficie
 * permanente, junto al dato que cambia.
 *
 * Sin texto visible, así que `label` es obligatoria y sirve dos veces: nombre
 * accesible (`aria-label`) y rótulo al pasar el ratón (`title`).
 */
export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title"> & {
  label: string;
  icon: LucideIcon;
};

export function IconButton({ label, icon: Icon, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-heading",
        "disabled:pointer-events-none disabled:opacity-60",
        colorTransition,
        focusRing,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={iconStroke.regular} />
    </button>
  );
}

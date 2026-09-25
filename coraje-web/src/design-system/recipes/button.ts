import { cn } from "../utilities/cn";
import { colorTransition, focusRing } from "./interaction";

/**
 * Receta de botón. Se aplica igual a `<button>` y a `<Link>`: en HelpDesk hay
 * acciones que son navegación (ingresar con Microsoft) y deben verse como
 * acción sin dejar de ser un enlace.
 *
 * Jerarquía: `primary` es la única acción principal de una vista; `secondary`
 * acompaña sin competir; `danger` declara un efecto que no se deshace
 * (rechazar) y nunca recibe el foco inicial. El peso es `bold` (700): Lato no
 * tiene intermedios.
 *
 * `disabled` se ve apagado y no reacciona al pasar el ratón: un botón que
 * cambia de color sin poder usarse invita a insistir.
 */
const variants = {
  primary: "bg-action text-on-action hover:bg-action-hover",
  secondary: "border border-line-strong bg-surface text-heading hover:bg-surface-sunken",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-surface",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
  lg: "h-11 px-5 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonRecipe({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-bold",
    colorTransition,
    focusRing,
    variants[variant],
    sizes[size],
    "disabled:pointer-events-none disabled:opacity-60",
    fullWidth && "w-full",
  );
}

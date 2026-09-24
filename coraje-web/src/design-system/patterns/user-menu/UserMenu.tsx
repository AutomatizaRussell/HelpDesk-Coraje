"use client";

import { LogOut } from "lucide-react";
import { useId } from "react";

import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Avatar con su menú: la persona y el cierre de sesión de HelpDesk. Réplica
 * del desplegable de la topbar de Conecta, compartida por los dos modos de
 * entrada para que cerrar sesión esté siempre en el mismo sitio.
 *
 * Usa la API nativa `popover`: cierre al pulsar fuera y con Esc, capa
 * superior y cero JavaScript propio para abrir o cerrar. Se ancla a la
 * esquina superior derecha, bajo la barra, que es donde siempre está el
 * avatar: así no necesita posicionamiento por ancla, que no todos los
 * navegadores soportan.
 */
/** Altura de la barra bajo la que se abre el menú, según el modo de entrada. */
const anchors = {
  topbar: "top-topbar lg:top-topbar-wide",
  appBar: "top-app-bar lg:top-app-bar-wide",
} as const;

export function UserMenu({
  displayName,
  roleLabel,
  anchor,
  signOutAction,
}: {
  displayName: string;
  /** Segunda línea del encabezado del menú; se omite si no hay. */
  roleLabel?: string;
  anchor: keyof typeof anchors;
  signOutAction: () => Promise<void>;
}) {
  const menuId = useId();
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        aria-label="Menú de usuario"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-pill bg-action text-base font-black text-on-action hover:bg-action-hover",
          colorTransition,
          focusRing,
        )}
      >
        {initial}
      </button>

      <div
        id={menuId}
        popover="auto"
        className={cn(
          "inset-auto right-4 m-0 w-64 overflow-hidden rounded-surface border border-shell-menu-line bg-surface p-0 text-ink shadow-shell-menu lg:right-8",
          anchors[anchor],
        )}
      >
        <div className="flex items-center gap-3 border-b border-shell-menu-line bg-shell-menu-header-surface px-4 py-4">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-action text-md font-black text-on-action"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink">{displayName}</p>
            {roleLabel ? (
              <p className="mt-0.5 truncate text-2xs font-bold uppercase tracking-wider text-shell-topbar-muted">
                {roleLabel}
              </p>
            ) : null}
          </div>
        </div>
        <form action={signOutAction} className="p-2">
          <button
            type="submit"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-shell-item px-3 py-2.5 text-left text-sm font-bold text-shell-menu-danger-ink hover:bg-shell-menu-danger-hover-surface hover:text-shell-menu-danger-hover-ink",
              colorTransition,
              focusRing,
            )}
          >
            <LogOut aria-hidden="true" className="size-3.5" strokeWidth={iconStroke.regular} />
            Cerrar sesión de HelpDesk
          </button>
        </form>
      </div>
    </>
  );
}

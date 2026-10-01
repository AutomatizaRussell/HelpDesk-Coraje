"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode, type ToggleEvent } from "react";

import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing, focusRingTopbar } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import { shellPopoverAnchors } from "../user-menu/UserMenu";

/**
 * Campana de avisos en la barra superior, junto al avatar (U15). La misma en
 * los dos modos de entrada, para que los avisos estén siempre en el mismo
 * sitio.
 *
 * Solo presentación: el número llega del servidor con la página, y el
 * contenido del panel lo pone quien la usa (`children`), que se entera de que
 * se abrió por `onOpen`. Así el panel se carga cuando alguien lo abre y no en
 * cada página: el número cuesta un conteo; la lista, solo si se mira.
 *
 * Mismo mecanismo que el menú del avatar: la API nativa `popover`, con cierre
 * al pulsar fuera y con Esc, y anclada bajo la barra.
 *
 * El número va en el acento del área de quien entra (U16), con su tinta
 * legible (`on-accent`), y nunca en el rojo de peligro: un aviso pendiente no
 * es una urgencia (design/sistema-helpdesk.md, D5). En Revisoría el acento es
 * naranja; sigue sin ser el ámbar de «por vencer», que es otro token.
 */
export type NoticeBellProps = {
  /** Pendientes abiertos más novedades sin leer. Con 0 no se dibuja el número. */
  count: number;
  anchor: keyof typeof shellPopoverAnchors;
  /** La página con todos los avisos. */
  allHref: string;
  onOpen?: () => void;
  children: ReactNode;
};

/** Más de dos cifras no caben en la insignia, y nadie cuenta más allá. */
const MAX_BADGE = 99;

export function NoticeBell({ count, anchor, allHref, onOpen, children }: NoticeBellProps) {
  const panelId = useId();
  const titleId = useId();
  const label = count > 0 ? `Avisos, ${count} por revisar` : "Avisos";

  const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState === "open") onOpen?.();
  };

  const closePanel = () => document.getElementById(panelId)?.hidePopover();

  return (
    <>
      <button
        type="button"
        popoverTarget={panelId}
        aria-label={label}
        title="Avisos"
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-pill text-shell-topbar-muted hover:bg-shell-control-hover-surface hover:text-shell-topbar-ink",
          colorTransition,
          focusRingTopbar,
        )}
      >
        <Bell aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1 text-2xs font-bold tabular-nums text-on-accent ring-2 ring-shell-topbar-surface"
          >
            {count > MAX_BADGE ? `${MAX_BADGE}+` : count}
          </span>
        ) : null}
      </button>

      <div
        id={panelId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        onToggle={handleToggle}
        className={cn(
          "inset-auto left-4 right-4 m-0 ml-auto w-auto max-w-notice-panel overflow-hidden rounded-surface border border-shell-menu-line bg-surface p-0 text-ink shadow-shell-menu lg:right-8",
          shellPopoverAnchors[anchor],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-shell-menu-line bg-shell-menu-header-surface px-4 py-3">
          <p id={titleId} className="text-base font-bold text-heading">
            Avisos
          </p>
          <Link
            href={allHref}
            onClick={closePanel}
            className={cn("rounded-control px-2 py-1 text-sm font-bold text-heading hover:bg-surface-sunken", colorTransition, focusRing)}
          >
            Ver todos
          </Link>
        </div>
        {children}
      </div>
    </>
  );
}

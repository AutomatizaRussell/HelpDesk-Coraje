"use client";

import { LogOut, Menu, PanelLeftOpen, X } from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { BrandStripe } from "../../components/BrandStripe";
import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import { CONECTA_BADGE, CONECTA_NAVIGATION, type ConectaNavItem } from "./conecta-navigation";

/**
 * Shell de HelpDesk: réplica del de Conecta (design/sistema-helpdesk.md §2,
 * «Navegación»), para que pasar de un módulo al otro se lea continuo.
 *
 * Tres piezas:
 *
 * - **Columna replegada** (≥ lg): solo iconos, sin logotipo ni globo — el
 *   manual prohíbe usar el isotipo como marca por sí solo. Conecta no tiene
 *   forma replegada; esta la define HelpDesk con la estructura del original.
 * - **Topbar**: lleva el logotipo oficial con su espacio libre, el nombre del
 *   módulo y el título de la vista, y al empleado a la derecha.
 * - **Sidebar desplegado**: `<dialog>` modal que se **superpone** al contenido
 *   sin desplazarlo. Tapa el logotipo de la topbar, así que nunca se ven dos, y
 *   la bandeja no cambia de ancho al abrirlo. El diálogo nativo aporta el
 *   bloqueo del foco, el cierre con Esc, la devolución del foco al botón que lo
 *   abrió y la capa superior, sin librería ni índices z.
 *
 * Solo se toma de Conecta el shell: el contenido de `children` sigue el
 * contrato propio de HelpDesk.
 */
export type ConectaShellProps = {
  /** Título de la vista, en la topbar. */
  title: string;
  employeeName: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

const MODULE_NAME = "HelpDesk";

export function ConectaShell({ title, employeeName, signOutAction, children }: ConectaShellProps) {
  const sidebarRef = useRef<HTMLDialogElement>(null);
  const initial = employeeName.trim().charAt(0).toUpperCase();

  const openSidebar = () => sidebarRef.current?.showModal();
  const closeSidebar = () => sidebarRef.current?.close();

  // El contenido del diálogo ocupa todo su alto: un clic cuyo destino es el
  // propio <dialog> solo puede haber caído en el fondo oscurecido.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeSidebar();
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <ShellRail onExpand={openSidebar} />

      <div className="flex min-h-dvh flex-col lg:pl-rail">
        <header className="sticky top-0 z-(--hd-layer-topbar) border-b border-shell-line bg-shell-surface">
          <div className="flex h-topbar items-center pr-4 lg:h-topbar-wide lg:pr-8">
            <button
              type="button"
              onClick={openSidebar}
              aria-label="Abrir menú"
              className={cn(
                "ml-2 rounded-control p-2 text-shell-muted hover:bg-shell-control-hover-surface hover:text-heading lg:hidden",
                colorTransition,
                focusRing,
              )}
            >
              <Menu aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
            </button>

            <BrandLogo placement="topbar" />

            <div className="min-w-0 flex-1">
              <p className="hidden text-2xs font-black uppercase tracking-widest text-shell-muted sm:block">
                {MODULE_NAME}
              </p>
              <h1 className="truncate text-md font-black tracking-tight text-heading lg:text-lg">{title}</h1>
            </div>

            <div className="flex shrink-0 items-center gap-3 lg:gap-5">
              <span aria-hidden="true" className="hidden h-10 w-px bg-shell-line sm:block" />
              <p className="hidden max-w-48 truncate text-base font-bold text-heading sm:block">{employeeName}</p>
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-pill bg-action text-base font-black text-on-action"
              >
                {initial}
              </span>
            </div>
          </div>
          <BrandStripe />
        </header>

        <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>

      <dialog
        ref={sidebarRef}
        aria-label="Menú de Conecta"
        onClick={closeOnBackdrop}
        className="m-0 h-dvh max-h-dvh w-sidebar max-w-full bg-shell-surface shadow-overlay backdrop:bg-shell-scrim"
      >
        <ShellSidebar employeeName={employeeName} initial={initial} onClose={closeSidebar} signOutAction={signOutAction} />
      </dialog>
    </div>
  );
}

/** Columna replegada: iconos del menú de Conecta, sin marca. */
function ShellRail({ onExpand }: { onExpand: () => void }) {
  return (
    <nav
      aria-label="Conecta"
      className="fixed inset-y-0 left-0 z-(--hd-layer-rail) hidden w-rail flex-col items-center gap-2 border-r border-shell-line bg-shell-surface py-4 lg:flex"
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label="Mostrar menú de Conecta"
        title="Mostrar menú"
        className={cn(
          "mb-2 flex size-11 items-center justify-center rounded-surface text-shell-muted hover:bg-shell-control-hover-surface hover:text-heading",
          colorTransition,
          focusRing,
        )}
      >
        <PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
      </button>

      {CONECTA_NAVIGATION.map((section, index) => (
        <div key={section.label} className="flex flex-col items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="my-1 h-px w-8 bg-shell-line" /> : null}
          {section.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "flex size-11 items-center justify-center rounded-surface",
                colorTransition,
                focusRing,
                navItemTone(item),
              )}
            >
              <item.icon aria-hidden="true" className="size-4.5" strokeWidth={iconStroke.regular} />
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Sidebar desplegado: réplica del SidebarShell de Conecta. */
function ShellSidebar({
  employeeName,
  initial,
  onClose,
  signOutAction,
}: {
  employeeName: string;
  initial: string;
  onClose: () => void;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-shell-line">
        <div className="flex items-start justify-between">
          <BrandLogo placement="sidebar" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className={cn(
              "mr-1 mt-2 rounded-control p-2 text-shell-muted hover:bg-shell-control-hover-surface hover:text-heading",
              colorTransition,
              focusRing,
            )}
          >
            <X aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
          </button>
        </div>
        <p className="mx-logo-clear-sidebar mb-5 inline-flex rounded-pill border border-shell-badge-line bg-shell-badge-surface px-3 py-1 text-2xs font-black uppercase tracking-widest text-shell-muted">
          {CONECTA_BADGE}
        </p>
      </div>

      <div className="border-b border-shell-line px-4 py-4">
        <div className="flex items-center gap-3 rounded-surface border border-shell-line bg-shell-card-surface px-4 py-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-surface bg-linear-to-br from-shell-avatar-from to-shell-avatar-to text-base font-bold text-shell-on-item-active"
          >
            {initial}
          </span>
          <p className="min-w-0 truncate text-base font-bold text-heading">{employeeName}</p>
        </div>
      </div>

      <nav aria-label="Conecta" className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {CONECTA_NAVIGATION.map((section) => (
          <div key={section.label} className="space-y-2">
            <p className="px-4 text-xs font-black uppercase tracking-widest text-shell-muted">{section.label}</p>
            {section.items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-surface px-4 py-3 text-base font-bold",
                  colorTransition,
                  focusRing,
                  navItemTone(item),
                )}
              >
                <item.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={iconStroke.regular} />
                <span className="truncate">{item.label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>

      <form action={signOutAction} className="border-t border-shell-line p-5">
        <button
          type="submit"
          className={cn(
            "flex w-full items-center gap-3 rounded-surface px-4 py-3 text-base font-bold text-shell-muted hover:bg-shell-sign-out-hover-surface hover:text-shell-sign-out-hover-ink",
            colorTransition,
            focusRing,
          )}
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={iconStroke.regular} />
          Cerrar sesión de HelpDesk
        </button>
      </form>
    </div>
  );
}

/** Tono de un ítem del menú: el activo lleva el degradado navy de Conecta. */
function navItemTone(item: ConectaNavItem): string {
  return item.current
    ? "bg-linear-135 from-shell-item-active-from to-shell-item-active-to text-shell-on-item-active shadow-shell-item-active"
    : "text-shell-item-ink hover:bg-shell-item-hover-surface hover:text-shell-item-hover-ink";
}

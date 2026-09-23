"use client";

import { LogOut, Menu, X } from "lucide-react";
import { useId, useRef, type MouseEvent, type ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing, focusRingInverse } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import {
  CONECTA_BADGE,
  CONECTA_NAVIGATION,
  CONECTA_ROLE_LABEL,
  type ConectaNavItem,
} from "./conecta-navigation";

/**
 * Shell de HelpDesk: réplica del de Conecta (rama `stiben` @ `9df5500`, la
 * que coincide con lo desplegado; design/sistema-helpdesk.md §2,
 * «Navegación»), para que pasar de un módulo al otro se lea continuo.
 *
 * Tres piezas, y en cada una lo que se aparta de Conecta es deliberado:
 *
 * - **Columna replegada** (≥ lg): navy, solo iconos. Conecta pone el globo
 *   blanco arriba; aquí no, porque el manual prohíbe usar el isotipo como
 *   marca por sí solo, y el logotipo completo va en la topbar.
 * - **Topbar**: blanca y sin franja, como la de Conecta, con la hamburguesa,
 *   el antetítulo, el título, el rol y el nombre, y el avatar con su menú.
 *   Añade el logotipo oficial con su espacio libre, que Conecta no lleva.
 * - **Sidebar desplegado**: en Conecta, la hamburguesa de escritorio ensancha
 *   la columna y empuja el contenido. Aquí es un `<dialog>` modal que se
 *   **superpone** sin desplazar nada: tapa el logotipo de la topbar, así que
 *   nunca se ven dos, y la bandeja no cambia de ancho. El diálogo nativo
 *   aporta el bloqueo del foco, el cierre con Esc, la devolución del foco y la
 *   capa superior sin librería ni índices z.
 *
 * El menú del avatar usa la API nativa `popover`: cierre al pulsar fuera y con
 * Esc, capa superior y cero JavaScript propio para abrirlo o cerrarlo.
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
  const userMenuId = useId();
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
      <ShellRail />

      <div className="flex min-h-dvh flex-col lg:pl-rail">
        <header className="sticky top-0 z-(--hd-layer-topbar) border-b border-shell-topbar-line bg-shell-topbar-surface">
          <div className="flex h-topbar items-center pr-4 lg:h-topbar-wide lg:pr-8">
            <button
              type="button"
              onClick={openSidebar}
              aria-haspopup="dialog"
              aria-label="Abrir menú"
              className={cn(
                "ml-2 rounded-shell-item p-2 text-shell-topbar-muted hover:bg-shell-control-hover-surface hover:text-heading lg:ml-4",
                colorTransition,
                focusRing,
              )}
            >
              <Menu aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
            </button>

            <BrandLogo placement="topbar" />

            <div className="min-w-0 flex-1">
              <p className="hidden text-2xs font-black uppercase tracking-widest text-shell-topbar-muted sm:block">
                {MODULE_NAME}
              </p>
              <h1 className="truncate text-md font-black tracking-tight text-heading lg:text-lg">{title}</h1>
            </div>

            <div className="flex shrink-0 items-center gap-3 lg:gap-5">
              <span aria-hidden="true" className="hidden h-10 w-px bg-shell-topbar-line sm:block" />
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-base font-bold text-heading">{CONECTA_ROLE_LABEL}</p>
                <p className="mt-0.5 max-w-56 truncate text-xs text-shell-topbar-muted">{employeeName}</p>
              </div>
              <button
                type="button"
                popoverTarget={userMenuId}
                aria-label="Menú de usuario"
                className={cn(
                  "flex size-10 items-center justify-center rounded-pill bg-action text-base font-black text-on-action hover:bg-action-hover",
                  colorTransition,
                  focusRing,
                )}
              >
                {initial}
              </button>
            </div>
          </div>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>

      <UserMenu id={userMenuId} employeeName={employeeName} initial={initial} signOutAction={signOutAction} />

      <dialog
        ref={sidebarRef}
        aria-label="Menú de Conecta"
        onClick={closeOnBackdrop}
        className="m-0 h-dvh max-h-dvh w-sidebar max-w-full bg-shell-surface text-shell-on-surface shadow-overlay backdrop:bg-shell-scrim"
      >
        <ShellSidebar employeeName={employeeName} initial={initial} onClose={closeSidebar} signOutAction={signOutAction} />
      </dialog>
    </div>
  );
}

/** Columna replegada: iconos del menú de Conecta, sin marca. */
function ShellRail() {
  return (
    <nav
      aria-label="Conecta"
      className="fixed inset-y-0 left-0 z-(--hd-layer-rail) hidden w-rail flex-col gap-6 border-r border-shell-line bg-shell-surface px-3 pb-4 pt-topbar-wide lg:flex"
    >
      {CONECTA_NAVIGATION.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} className="justify-center px-2 py-2" ariaLabel={item.label}>
              <item.icon aria-hidden="true" className="size-5" strokeWidth={iconStroke.light} />
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Sidebar desplegado: réplica del SidebarShell + RoleSidebar de Conecta. */
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
      <div>
        <div className="flex items-start justify-between">
          <BrandLogo placement="sidebar" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className={cn(
              "mr-1 mt-2 rounded-shell-item p-2 text-shell-on-surface-muted hover:bg-shell-item-hover-surface hover:text-shell-on-surface",
              colorTransition,
              focusRingInverse,
            )}
          >
            <X aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
          </button>
        </div>
        <p className="mx-logo-clear-sidebar mb-4 inline-flex rounded-pill bg-shell-badge-surface px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-shell-badge-ink">
          {CONECTA_BADGE}
        </p>
      </div>

      <div className="border-b border-shell-divider px-4 py-4">
        <div className="flex items-center gap-3 rounded-surface border border-shell-card-line bg-shell-card-surface px-4 py-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-surface bg-linear-to-br from-shell-avatar-from to-shell-avatar-to text-base font-bold text-shell-on-surface"
          >
            {initial}
          </span>
          <p className="min-w-0 truncate text-base font-bold text-shell-on-surface">{employeeName}</p>
        </div>
      </div>

      <nav aria-label="Conecta" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {CONECTA_NAVIGATION.map((section) => (
          <div key={section.label} className="space-y-1">
            <p className="px-3 pb-1 text-2xs font-bold uppercase tracking-widest text-shell-on-surface-muted">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} className="px-3 py-2 text-sm">
                  <item.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={iconStroke.light} />
                  <span className="ml-3 truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <form action={signOutAction} className="border-t border-shell-divider p-3">
        <button
          type="submit"
          className={cn(
            "flex w-full items-center gap-3 rounded-surface px-4 py-3 text-base font-bold text-shell-sign-out-ink hover:bg-shell-sign-out-hover-surface hover:text-shell-sign-out-hover-ink",
            colorTransition,
            focusRingInverse,
          )}
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={iconStroke.regular} />
          Cerrar sesión de HelpDesk
        </button>
      </form>
    </div>
  );
}

/**
 * Enlace del menú de Conecta, común a la columna y al sidebar. `<a>` y no
 * `<Link>`: las rutas son de Conecta, fuera del basePath de HelpDesk. Los
 * accesos rápidos abren pestaña nueva, como en Conecta.
 */
function NavLink({
  item,
  className,
  ariaLabel,
  children,
}: {
  item: ConectaNavItem;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={item.href}
      title={item.label}
      aria-label={ariaLabel}
      aria-current={item.current ? "page" : undefined}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className={cn(
        "flex w-full items-center rounded-shell-item",
        colorTransition,
        focusRingInverse,
        item.current
          ? "bg-shell-item-active-surface font-bold text-shell-on-surface"
          : "text-shell-item-ink hover:bg-shell-item-hover-surface hover:text-shell-on-surface",
        className,
      )}
    >
      {children}
    </a>
  );
}

/**
 * Menú del avatar, réplica del desplegable de la topbar de Conecta. Se ancla
 * a la esquina superior derecha, bajo la topbar, que es donde siempre está el
 * avatar: así no necesita posicionamiento por ancla, que no todos los
 * navegadores soportan.
 */
function UserMenu({
  id,
  employeeName,
  initial,
  signOutAction,
}: {
  id: string;
  employeeName: string;
  initial: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div
      id={id}
      popover="auto"
      className="inset-auto right-4 top-topbar m-0 w-64 overflow-hidden rounded-surface border border-shell-menu-line bg-surface p-0 text-ink shadow-shell-menu lg:right-8 lg:top-topbar-wide"
    >
      <div className="flex items-center gap-3 border-b border-shell-menu-line bg-shell-menu-header-surface px-4 py-4">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-action text-md font-black text-on-action"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{employeeName}</p>
          <p className="mt-0.5 truncate text-2xs font-bold uppercase tracking-wider text-shell-topbar-muted">
            {CONECTA_ROLE_LABEL}
          </p>
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
  );
}

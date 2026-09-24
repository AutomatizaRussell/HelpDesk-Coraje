"use client";

import { LogOut, Menu, X } from "lucide-react";
import { useMemo, useRef, type MouseEvent, type ReactNode } from "react";

import { BrandIsotype } from "../../components/BrandIsotype";
import { BrandLogo } from "../../components/BrandLogo";
import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRing, focusRingInverse } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import { ModuleNav, type ModuleNavItem } from "../module-nav/ModuleNav";
import { UserMenu } from "../user-menu/UserMenu";
import {
  CONECTA_BADGE,
  CONECTA_ROLE_LABEL,
  CONECTA_SUBTITLE_FALLBACK,
  conectaNavigation,
  type ConectaNavEntry,
  type ConectaNavLink,
} from "./conecta-navigation";

/**
 * Shell de HelpDesk cuando se entra **desde Conecta**: réplica del de Conecta
 * (RBGCT-REACT `cb06681`), para que pasar de un módulo al otro se lea
 * continuo (design/sistema-helpdesk.md §2; specs/integracion-conecta.md §2).
 *
 * - **Columna replegada** (≥ lg): navy, con el isotipo blanco arriba y los
 *   iconos del menú de Conecta, como en Conecta.
 * - **Topbar**: blanca y sin franja, como la de Conecta: hamburguesa,
 *   antetítulo y título, rol y nombre, y el avatar con su menú. Sin logotipo:
 *   la marca va en el sidebar.
 * - **Navegación de HelpDesk**: fila de pestañas bajo la topbar (`ModuleNav`).
 * - **Sidebar desplegado**: en Conecta, la hamburguesa ensancha la columna y
 *   empuja el contenido. Aquí es un `<dialog>` modal que se **superpone** sin
 *   desplazar nada, para que la bandeja no cambie de ancho. El diálogo nativo
 *   aporta el bloqueo del foco, el cierre con Esc, la devolución del foco y la
 *   capa superior sin librería ni índices z.
 *
 * Los datos de la persona (nombre corto, área, permisos SQF) llegan del perfil
 * de Conecta ya cotejado en servidor; si no lo hay, el llamador pasa los datos
 * propios de HelpDesk. **Solo deciden qué se muestra**, nunca un permiso.
 */
export type ConectaShellProps = {
  /** Título de la vista, en la topbar. */
  title: string;
  displayName: string;
  /** Área o cargo; `null` pinta el mismo texto por defecto que Conecta. */
  subtitle: string | null;
  sqfAccess: boolean;
  moduleNav: readonly ModuleNavItem[];
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

const MODULE_NAME = "HelpDesk";

export function ConectaShell({
  title,
  displayName,
  subtitle,
  sqfAccess,
  moduleNav,
  signOutAction,
  children,
}: ConectaShellProps) {
  const sidebarRef = useRef<HTMLDialogElement>(null);
  const sections = useMemo(() => conectaNavigation({ sqfAccess }), [sqfAccess]);
  const initial = displayName.trim().charAt(0).toUpperCase();

  const openSidebar = () => sidebarRef.current?.showModal();
  const closeSidebar = () => sidebarRef.current?.close();

  // El contenido del diálogo ocupa todo su alto: un clic cuyo destino es el
  // propio <dialog> solo puede haber caído en el fondo oscurecido.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeSidebar();
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <nav
        aria-label="Conecta"
        className="fixed inset-y-0 left-0 z-(--hd-layer-rail) hidden w-rail flex-col border-r border-shell-line bg-shell-surface lg:flex"
      >
        <div className="px-3 py-4">
          <BrandIsotype />
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-0.5">
              {section.items.map((entry) => {
                // Replegado, un grupo se muestra con su icono y lleva a su
                // primer hijo: no hay sitio para desplegarlo.
                const link = entry.kind === "group" ? { ...entry.children[0], label: entry.label, icon: entry.icon } : entry;
                return (
                  <NavLink key={entry.label} item={link} className="justify-center px-2 py-2" ariaLabel={link.label}>
                    <link.icon aria-hidden="true" className="size-5" strokeWidth={iconStroke.light} />
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex min-h-dvh flex-col lg:pl-rail">
        <header className="sticky top-0 z-(--hd-layer-topbar)">
          <div className="border-b border-shell-topbar-line bg-shell-topbar-surface">
            <div className="flex h-topbar items-center justify-between gap-4 px-4 lg:h-topbar-wide lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={openSidebar}
                  aria-haspopup="dialog"
                  aria-label="Abrir menú"
                  className={cn(
                    "rounded-shell-item p-2 text-shell-topbar-muted hover:bg-shell-control-hover-surface hover:text-heading",
                    colorTransition,
                    focusRing,
                  )}
                >
                  <Menu aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
                </button>
                <div className="min-w-0">
                  <p className="hidden text-2xs font-black uppercase tracking-widest text-shell-topbar-muted sm:block">
                    {MODULE_NAME}
                  </p>
                  <h1 className="truncate text-md font-black tracking-tight text-heading lg:text-lg">{title}</h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 lg:gap-5">
                <span aria-hidden="true" className="hidden h-10 w-px bg-shell-topbar-line sm:block" />
                <div className="hidden text-right sm:block">
                  <p className="max-w-48 truncate text-base font-bold text-heading">{CONECTA_ROLE_LABEL}</p>
                  <p className="mt-0.5 max-w-56 truncate text-xs text-shell-topbar-muted">{displayName}</p>
                </div>
                <UserMenu
                  displayName={displayName}
                  roleLabel={CONECTA_ROLE_LABEL}
                  anchor="topbar"
                  signOutAction={signOutAction}
                />
              </div>
            </div>
          </div>
          <ModuleNav items={moduleNav} />
        </header>

        <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>

      <dialog
        ref={sidebarRef}
        aria-label="Menú de Conecta"
        onClick={closeOnBackdrop}
        className="m-0 h-dvh max-h-dvh w-sidebar max-w-full bg-shell-surface text-shell-on-surface shadow-overlay backdrop:bg-shell-scrim md:w-sidebar-md lg:w-sidebar-lg xl:w-sidebar-xl"
      >
        <div className="flex h-full flex-col">
          <div>
            <div className="flex items-start justify-between">
              <BrandLogo placement="sidebar" />
              <button
                type="button"
                onClick={closeSidebar}
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
            <p className="mx-logo-clear-sidebar mb-4 inline-flex rounded-pill bg-shell-badge-surface px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-shell-badge-ink md:mx-logo-clear-sidebar-md lg:mx-logo-clear-sidebar-lg xl:mx-logo-clear-sidebar-xl">
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
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-shell-on-surface">{displayName}</p>
                <p className="truncate text-xs text-shell-on-surface-muted">{subtitle ?? CONECTA_SUBTITLE_FALLBACK}</p>
              </div>
            </div>
          </div>

          <nav aria-label="Conecta" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            {sections.map((section) => (
              <div key={section.label} className="space-y-1">
                <p className="px-3 pb-1 text-2xs font-bold uppercase tracking-widest text-shell-on-surface-muted">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((entry) => (
                    <SidebarEntry key={entry.label} entry={entry} />
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
      </dialog>
    </div>
  );
}

/**
 * Entrada del sidebar desplegado. Un grupo es `<details>` abierto por defecto,
 * como los grupos estáticos de Conecta: se pliega sin JavaScript propio.
 */
function SidebarEntry({ entry }: { entry: ConectaNavEntry }) {
  if (entry.kind === "link") {
    return (
      <NavLink item={entry} className="px-3 py-2 text-sm">
        <entry.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={iconStroke.light} />
        <span className="ml-3 truncate">{entry.label}</span>
      </NavLink>
    );
  }

  return (
    <details open className="space-y-1">
      <summary
        className={cn(
          "flex w-full cursor-pointer list-none items-center rounded-shell-item px-3 py-2 text-sm text-shell-item-ink hover:bg-shell-item-hover-surface hover:text-shell-on-surface",
          colorTransition,
          focusRingInverse,
        )}
      >
        <entry.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={iconStroke.light} />
        <span className="ml-3 truncate">{entry.label}</span>
      </summary>
      <div className="ml-5.5 space-y-0.5 border-l border-shell-card-line pl-2">
        {entry.children.map((child) => (
          <NavLink key={child.href} item={child} className="px-3 py-2 text-sm">
            <child.icon aria-hidden="true" className="size-4.5 shrink-0" strokeWidth={iconStroke.light} />
            <span className="ml-3 truncate">{child.label}</span>
          </NavLink>
        ))}
      </div>
    </details>
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
  item: ConectaNavLink;
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

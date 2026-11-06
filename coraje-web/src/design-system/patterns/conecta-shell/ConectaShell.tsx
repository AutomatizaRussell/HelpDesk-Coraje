"use client";

import { LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, type MouseEvent, type ReactNode } from "react";

import audithubSymbol from "../../../../public/conecta/audithub-simbolo.svg";
import sqfSymbol from "../../../../public/conecta/sqf-simbolo.png";
import isotypeWatermark from "../../../../public/rb-isotype-white-hero.png";
import { BrandIsotype } from "../../components/BrandIsotype";
import { BrandLogo } from "../../components/BrandLogo";
import { iconStroke } from "../../foundations/iconography";
import { colorTransition, focusRingInverse, focusRingTopbar, modeTransition } from "../../recipes/interaction";
import { helpdeskTheme } from "../../themes/helpdesk";
import { cn } from "../../utilities/cn";
import { ModuleNav, type ModuleNavItem } from "../module-nav/ModuleNav";
import type { ColorMode } from "../mode-switch/ModeSwitch";
import type { AreaThemeKey } from "../area/area";
import { UserMenu } from "../user-menu/UserMenu";
import type { ConectaModule } from "./conecta-modules";
import {
  CONECTA_ROLE_LABEL,
  conectaNavigation,
  type ConectaAppSymbol,
  type ConectaNavEntry,
  type ConectaNavLink,
} from "./conecta-navigation";

/** Lema del pie del sidebar de Conecta (`SidebarShell.jsx`). */
const CONECTA_SLOGAN = "Personas, conocimiento y oportunidades para llegar más lejos.";

/**
 * Símbolos de las aplicaciones de los accesos rápidos, copiados de
 * RBGCT-REACT `frontend/src/assets/`. Importación estática, como el logotipo:
 * Next les antepone el `basePath` y el perímetro no las intercepta.
 */
const APP_SYMBOLS = { sqf: sqfSymbol, audithub: audithubSymbol } satisfies Record<ConectaAppSymbol, unknown>;

/**
 * Shell de HelpDesk cuando se entra **desde Conecta**: réplica del de Conecta
 * (RBGCT-REACT, en el commit que fija `conecta-upstream.json`), para que pasar
 * de un módulo al otro se lea continuo (design/sistema-helpdesk.md §2;
 * specs/integracion-conecta.md §2).
 *
 * - **Columna replegada** (≥ lg): navy, con el isotipo blanco arriba y los
 *   iconos del menú de Conecta, como en Conecta.
 * - **Topbar**: blanca (navy en modo Externo, U17) y sin franja. Desde U32
 *   ya no replica la de Conecta: hamburguesa, «HelpDesk», las secciones del
 *   módulo si hay más de una (`ModuleNav`), la campana de avisos (U15) y el
 *   avatar con su menú, que lleva el nombre. El título de la vista y el rol
 *   repetían lo que la cabecera de cada vista ya dice. Sin logotipo: la marca
 *   va en la columna.
 * - **Sidebar desplegado**: en Conecta, la hamburguesa ensancha la columna y
 *   empuja el contenido. Aquí es un `<dialog>` modal que se **superpone** sin
 *   desplazar nada, para que la bandeja no cambie de ancho. El diálogo nativo
 *   aporta el bloqueo del foco, el cierre con Esc, la devolución del foco y la
 *   capa superior sin librería ni índices z. Como en Conecta desde su
 *   rediseño del 04-nov-2026: sin tarjeta de la persona (sus datos van en la
 *   topbar), ítem activo en pastilla blanca y un pie con la franja, el lema y
 *   el globo como marca de agua.
 *
 * Los datos de la persona (nombre corto, módulos de Conecta) llegan del perfil
 * de Conecta ya cotejado en servidor; si no lo hay, el llamador pasa los datos
 * propios de HelpDesk. **Solo deciden qué se muestra**, nunca un permiso.
 */
export type ConectaShellProps = {
  /**
   * Título de la vista: encabeza el contenido o, con cabecera, queda para
   * lector de pantalla (la cabecera ya lo dice a la vista). Desde U32 no va
   * en la topbar, que solo nombra el módulo.
   */
  title: string;
  displayName: string;
  /** Módulos de Conecta de la persona: deciden qué entradas del menú se ven. */
  conectaModules: readonly ConectaModule[];
  moduleNav: readonly ModuleNavItem[];
  signOutAction: () => Promise<void>;
  /** Área de quien entra (U16): redefine el acento de todo el shell. */
  areaTheme: AreaThemeKey;
  /** Modo (U17): `externo` pinta en navy la topbar, las pestañas y el contenido. */
  mode: ColorMode;
  /** Antetítulo de la topbar: el nombre del módulo, igual en los dos modos. */
  moduleName: string;
  /** La campana de avisos, junto al avatar; se omite si la persona no tiene `aviso.consultar`. */
  noticeBell?: ReactNode;
  /**
   * Cabecera de ancho completo entre la navegación y el contenido (U30, la
   * del área en la bandeja). El título de la vista sigue en la topbar; el
   * contenido pierde el margen superior para que la primera tarjeta se monte
   * sobre el borde de la cabecera.
   */
  hero?: ReactNode;
  children: ReactNode;
};

export function ConectaShell({
  title,
  displayName,
  conectaModules,
  moduleNav,
  signOutAction,
  noticeBell,
  areaTheme,
  mode,
  moduleName,
  hero,
  children,
}: ConectaShellProps) {
  const sidebarRef = useRef<HTMLDialogElement>(null);
  const sections = useMemo(() => conectaNavigation(conectaModules), [conectaModules]);

  const openSidebar = () => sidebarRef.current?.showModal();
  const closeSidebar = () => sidebarRef.current?.close();

  // El contenido del diálogo ocupa todo su alto: un clic cuyo destino es el
  // propio <dialog> solo puede haber caído en el fondo oscurecido.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeSidebar();
  };

  return (
    <div data-area={areaTheme} data-mode={mode} className={cn("min-h-dvh bg-canvas", modeTransition)}>
      <div className="fixed inset-y-0 left-0 z-(--hd-layer-rail) hidden w-rail flex-col border-r border-shell-line bg-shell-surface lg:flex">
        <div className="px-3 py-4">
          <BrandIsotype />
        </div>
        <nav aria-label="Conecta" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-0.5">
              {section.items.map((entry) => {
                // Replegado, un grupo se muestra con su icono y lleva a su
                // primer hijo: no hay sitio para desplegarlo.
                const link = entry.kind === "group" ? { ...entry.children[0], label: entry.label, icon: entry.icon } : entry;
                return (
                  <NavLink key={entry.label} item={link} className="justify-center px-2 py-2" ariaLabel={link.label}>
                    <NavGlyph item={link} className="size-5" />
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        {/* Mejora sobre Conecta, que solo lo ofrece con la barra desplegada:
            cerrar sesión queda al fondo de la columna, separado de la
            navegación por una línea, como en Impulsa. Dice «de HelpDesk»
            porque no cierra la sesión de Conecta. */}
        <form action={signOutAction} className="border-t border-shell-divider px-3 py-4">
          <button
            type="submit"
            aria-label="Cerrar sesión de HelpDesk"
            title="Cerrar sesión de HelpDesk"
            className={cn(
              "flex w-full items-center justify-center rounded-shell-item px-2 py-2 text-shell-sign-out-ink hover:bg-shell-sign-out-hover-surface hover:text-shell-sign-out-hover-ink",
              colorTransition,
              focusRingInverse,
            )}
          >
            <LogOut aria-hidden="true" className="size-5" strokeWidth={iconStroke.light} />
          </button>
        </form>
      </div>

      <div className="flex min-h-dvh flex-col lg:pl-rail">
        <header className="sticky top-0 z-(--hd-layer-topbar)">
          <div className={cn("border-b border-shell-topbar-line bg-shell-topbar-surface", modeTransition)}>
            <div className="flex h-topbar items-center justify-between gap-4 px-4 lg:h-topbar-wide lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={openSidebar}
                  aria-haspopup="dialog"
                  aria-label="Abrir menú"
                  className={cn(
                    "rounded-shell-item p-2 text-shell-topbar-muted hover:bg-shell-control-hover-surface hover:text-shell-topbar-ink",
                    colorTransition,
                    focusRingTopbar,
                  )}
                >
                  <Menu aria-hidden="true" className="size-5" strokeWidth={iconStroke.regular} />
                </button>
                <p className="hidden text-base font-bold text-shell-topbar-ink sm:block">{moduleName}</p>
                <ModuleNav items={moduleNav} className="sm:ml-4 sm:border-l sm:border-shell-topbar-line sm:pl-5" />
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {noticeBell}
                <UserMenu
                  displayName={displayName}
                  roleLabel={CONECTA_ROLE_LABEL}
                  anchor="topbar"
                  signOutAction={signOutAction}
                />
              </div>
            </div>
          </div>
        </header>

        {hero && <h1 className="sr-only">{title}</h1>}
        {hero}
        {/* Con cabecera, el contenido sube 60 px y se monta sobre su borde (la
            cabecera deja ese tramo en `pb-29`); `relative` lo pinta encima. */}
        <main
          id="contenido"
          className={cn("mx-auto w-full max-w-content flex-1 px-6 lg:px-10", hero ? "relative -mt-15 pb-8 lg:pb-10" : "py-8 lg:py-10")}
        >
          {!hero && <h1 className="mb-6 text-xl font-bold tracking-tight text-heading">{title}</h1>}
          {children}
        </main>
      </div>

      <dialog
        ref={sidebarRef}
        aria-label="Menú de Conecta"
        onClick={closeOnBackdrop}
        className="m-0 h-dvh max-h-dvh w-sidebar max-w-full overflow-hidden bg-shell-surface text-shell-on-surface shadow-overlay backdrop:bg-shell-scrim md:w-sidebar-md 2xl:w-sidebar-wide"
      >
        <div className="flex h-full flex-col">
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

          {/* Pie de Conecta: la marca de agua va detrás y no ocupa alto. A
              diferencia de Conecta, el lema no se oculta en pantallas bajas
              (ver `size.shellWatermark` en el tema). */}
          <div className="relative overflow-hidden border-t border-shell-divider px-5 pb-3 pt-5">
            <Image
              src={isotypeWatermark}
              alt=""
              aria-hidden="true"
              width={Number.parseFloat(helpdeskTheme.size.shellWatermark)}
              height={Number.parseFloat(helpdeskTheme.size.shellWatermark)}
              className="pointer-events-none absolute -bottom-12 -right-12 size-shell-watermark opacity-(--hd-shell-watermark-opacity)"
            />
            <span aria-hidden="true" className="block h-shell-accent-bar w-8 rounded-pill bg-shell-accent-bar" />
            <p className="relative mt-3 max-w-44 text-sm text-shell-slogan-ink">{CONECTA_SLOGAN}</p>
            <form action={signOutAction} className="relative -mx-2 mt-4">
              <button
                type="submit"
                className={cn(
                  "flex w-full items-center gap-3 rounded-surface px-4 py-3 text-sm font-bold text-shell-sign-out-ink hover:bg-shell-sign-out-hover-surface hover:text-shell-sign-out-hover-ink",
                  colorTransition,
                  focusRingInverse,
                )}
              >
                <LogOut aria-hidden="true" className="size-4" strokeWidth={iconStroke.regular} />
                Cerrar sesión de HelpDesk
              </button>
            </form>
          </div>
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
        <NavGlyph item={entry} className="size-4.5" />
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
      <div className="ml-5.5 space-y-0.5 border-l border-shell-group-line pl-2">
        {entry.children.map((child) => (
          <NavLink key={child.href} item={child} className="px-3 py-2 text-sm">
            <NavGlyph item={child} className="size-4.5" />
            <span className="ml-3 truncate">{child.label}</span>
          </NavLink>
        ))}
      </div>
    </details>
  );
}

/**
 * Icono de una entrada: el símbolo de su aplicación, en su color, si es un
 * acceso rápido (SQF, AuditHub), o el icono de línea del menú. Decorativo: el
 * nombre accesible lo da el enlace.
 */
function NavGlyph({ item, className }: { item: ConectaNavLink; className: string }) {
  if (item.symbol) {
    return (
      <Image src={APP_SYMBOLS[item.symbol]} alt="" aria-hidden="true" className={cn("shrink-0 object-contain", className)} />
    );
  }
  if (!item.icon) return null;
  return <item.icon aria-hidden="true" className={cn("shrink-0", className)} strokeWidth={iconStroke.light} />;
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
        "flex w-full items-center",
        colorTransition,
        focusRingInverse,
        // Activo: pastilla blanca con texto navy, como en Conecta. El foco
        // sigue siendo el anillo blanco con separación: queda sobre el navy
        // que rodea la pastilla, no sobre ella.
        item.current
          ? "rounded-shell-item-active bg-shell-item-active-surface font-bold text-shell-item-active-ink shadow-shell-item-active"
          : "rounded-shell-item text-shell-item-ink hover:bg-shell-item-hover-surface hover:text-shell-on-surface",
        className,
      )}
    >
      {children}
    </a>
  );
}

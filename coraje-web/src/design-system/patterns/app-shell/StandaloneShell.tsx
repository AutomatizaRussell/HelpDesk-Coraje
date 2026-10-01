import type { ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { modeTransition } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";
import { ModuleNav, type ModuleNavItem } from "../module-nav/ModuleNav";
import type { ColorMode } from "../mode-switch/ModeSwitch";
import type { AreaThemeKey } from "../area/area";
import { UserMenu } from "../user-menu/UserMenu";

/**
 * Shell de HelpDesk cuando se entra **directo**, sin sesión de Conecta
 * (specs/integracion-conecta.md §2). No replica nada de Conecta: quien no
 * viene de allí no tiene por qué ver su menú, y la mitad de sus enlaces le
 * pedirían otro ingreso.
 *
 * Diseño propio y mínimo: el logotipo oficial con su espacio libre (es la
 * única marca en pantalla), la persona con su menú y la misma navegación de
 * HelpDesk que en el modo Conecta, para que la aplicación se use igual en los
 * dos.
 */
export type StandaloneShellProps = {
  /** Título de la vista: aquí no hay topbar que lo lleve, va en el contenido. */
  title: string;
  displayName: string;
  moduleNav: readonly ModuleNavItem[];
  signOutAction: () => Promise<void>;
  /** Área de quien entra (U16): redefine el acento de todo el shell. */
  areaTheme: AreaThemeKey;
  /** Modo (U17): `coraje` pinta todo el shell en navy. */
  mode: ColorMode;
  /** El interruptor de modo, al final de las pestañas; se omite si la persona no tiene Coraje. */
  modeSwitch?: ReactNode;
  /** La campana de avisos, junto al avatar; se omite si la persona no tiene `aviso.consultar`. */
  noticeBell?: ReactNode;
  children: ReactNode;
};

export function StandaloneShell({
  title,
  displayName,
  moduleNav,
  signOutAction,
  noticeBell,
  areaTheme,
  mode,
  modeSwitch,
  children,
}: StandaloneShellProps) {
  return (
    <div data-area={areaTheme} data-mode={mode} className={cn("flex min-h-dvh flex-col bg-canvas", modeTransition)}>
      <header className="sticky top-0 z-(--hd-layer-topbar)">
        <div className={cn("border-b border-shell-topbar-line bg-shell-topbar-surface", modeTransition)}>
          <div className="flex h-app-bar items-center justify-between gap-4 pr-4 lg:h-app-bar-wide lg:pr-8">
            <BrandLogo placement={mode === "coraje" ? "appBarInverse" : "appBar"} />
            <div className="flex min-w-0 items-center gap-3">
              <p className="hidden max-w-56 truncate text-base font-bold text-shell-topbar-ink sm:block">{displayName}</p>
              {noticeBell}
              <UserMenu displayName={displayName} anchor="appBar" signOutAction={signOutAction} />
            </div>
          </div>
        </div>
        <ModuleNav items={moduleNav} trailing={modeSwitch} />
      </header>

      <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <h1 className="mb-6 text-xl font-black tracking-tight text-heading">{title}</h1>
        {children}
      </main>
    </div>
  );
}

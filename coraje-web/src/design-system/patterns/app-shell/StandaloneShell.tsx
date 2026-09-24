import type { ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { ModuleNav, type ModuleNavItem } from "../module-nav/ModuleNav";
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
  children: ReactNode;
};

export function StandaloneShell({ title, displayName, moduleNav, signOutAction, children }: StandaloneShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-(--hd-layer-topbar)">
        <div className="border-b border-line bg-surface">
          <div className="flex h-app-bar items-center justify-between gap-4 pr-4 lg:h-app-bar-wide lg:pr-8">
            <BrandLogo placement="appBar" />
            <div className="flex min-w-0 items-center gap-3">
              <p className="hidden max-w-56 truncate text-base font-bold text-heading sm:block">{displayName}</p>
              <UserMenu displayName={displayName} anchor="appBar" signOutAction={signOutAction} />
            </div>
          </div>
        </div>
        <ModuleNav items={moduleNav} />
      </header>

      <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <h1 className="mb-6 text-xl font-black tracking-tight text-heading">{title}</h1>
        {children}
      </main>
    </div>
  );
}

import type { ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { UserMenu } from "../user-menu/UserMenu";

/**
 * Marco del portal de clientes (specs/acceso-clientes.md).
 *
 * No es el shell de Conecta ni el de empleados, y a propósito: quien entra
 * aquí es una persona de un cliente, no de la firma, y no tiene nada que
 * hacer con el menú de Conecta ni con las secciones internas de HelpDesk.
 * Lleva lo mínimo: el logotipo de la firma (la única marca en pantalla), a
 * nombre de quién está el acceso y de qué empresa, y la salida.
 *
 * Se apoya en las mismas piezas que `StandaloneShell` (barra, menú de
 * persona, ancho de contenido) para que las dos superficies se lean como una
 * misma aplicación.
 */
export type PortalShellProps = {
  title: string;
  contactName: string;
  clientName: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

export function PortalShell({ title, contactName, clientName, signOutAction, children }: PortalShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-(--hd-layer-topbar) border-b border-line bg-surface">
        <div className="flex h-app-bar items-center justify-between gap-4 pr-4 lg:h-app-bar-wide lg:pr-8">
          <BrandLogo placement="appBar" />
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-56 truncate text-base font-bold text-heading">{contactName}</p>
              <p className="max-w-56 truncate text-sm text-ink-muted">{clientName}</p>
            </div>
            <UserMenu displayName={contactName} roleLabel={clientName} anchor="appBar" signOutAction={signOutAction} />
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-content flex-1 px-6 py-8 lg:px-10 lg:py-10">
        <h1 className="mb-6 text-xl font-black tracking-tight text-heading">{title}</h1>
        {children}
      </main>
    </div>
  );
}

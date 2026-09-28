import type { ReactNode } from "react";

import { BrandLogo } from "../../components/BrandLogo";
import { BrandStripe } from "../../components/BrandStripe";

/**
 * Panel de acceso: la superficie pública y sobria de quien todavía no entró
 * (design/sistema-helpdesk.md §6). Logotipo oficial con su espacio libre, un
 * título, una explicación corta y la acción. Es la misma forma que la
 * pantalla de ingreso de empleados (`/login`), para que la firma se vea igual
 * a un lado y al otro de la puerta.
 */
export function AccessPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-access-panel overflow-hidden rounded-surface border border-line bg-surface">
        <div className="flex justify-center border-b border-line">
          <BrandLogo placement="access" />
        </div>

        <div className="space-y-5 px-8 py-8">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-heading">{title}</h1>
            {description && <p className="text-ink-muted">{description}</p>}
          </div>
          {children}
        </div>

        <BrandStripe />
      </div>
    </main>
  );
}

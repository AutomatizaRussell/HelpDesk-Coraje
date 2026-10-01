import Link from "next/link";
import { notFound } from "next/navigation";

import { badge } from "@/design-system/recipes/badge";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldLabel } from "@/design-system/recipes/field";
import { focusRing } from "@/design-system/recipes/interaction";
import { surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { CLIENT_SEARCH_MIN_LENGTH, searchClients } from "@/server/portal/portal-admin-queries";

/**
 * Accesos de clientes: buscar el cliente al que se le va a dar acceso. La
 * búsqueda viaja en la URL (`?q=`), así que volver del detalle deja la lista
 * donde estaba, y la resuelve la base.
 *
 * Sin `portal.acceso.administrar`, la ruta responde como si no existiera.
 */
export default async function AccessSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const employee = await requireCurrentEmployee("/accesos");
  const { q = "" } = await searchParams;
  const results = await searchClients(employee.idPersonal, q);
  if (results === null) notFound();

  return (
    <AppFrame employee={employee} title="Accesos de clientes" mode="coraje">
      <div className="space-y-4">
        <form className={cn(surface(), "flex flex-wrap items-end gap-3")} role="search">
          <div className="min-w-64 flex-1">
            <label htmlFor="q" className={fieldLabel}>Cliente</label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre o NIT" className={fieldControl()} />
          </div>
          <button type="submit" className={buttonRecipe({ variant: "secondary" })}>Buscar</button>
        </form>

        {q.trim().length >= CLIENT_SEARCH_MIN_LENGTH && (
          <section className={surface({ padded: false })} aria-label="Resultados">
            {results.length === 0 ? (
              <p className="px-5 py-10 text-center text-ink-muted">Ningún cliente coincide con «{q.trim()}».</p>
            ) : (
              <ul className="divide-y divide-line">
                {results.map((cliente) => (
                  <li key={cliente.idCliente} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-sunken">
                    <div className="min-w-0">
                      <Link
                        href={`/accesos/${cliente.idCliente}`}
                        className={cn("rounded-control font-bold text-heading underline-offset-2 hover:underline", focusRing)}
                      >
                        {cliente.nombre}
                      </Link>
                      {cliente.identificacionFiscal && <p className="text-sm tabular-nums text-ink-muted">{cliente.identificacionFiscal}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!cliente.activo && <span className={badge("neutral")}>Inactivo</span>}
                      <span className="text-sm text-ink-muted">
                        {cliente.contactos === 1 ? "1 contacto" : `${cliente.contactos} contactos`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AppFrame>
  );
}

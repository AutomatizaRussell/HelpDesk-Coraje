import Link from "next/link";
import { notFound } from "next/navigation";

import {
  HEALTH_SEVERITY_LABEL,
  HEALTH_SEVERITY_TONE,
  HEALTH_SUMMARY_TONE,
} from "@/design-system/patterns/health-status/health-status";
import { badge } from "@/design-system/recipes/badge";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import { DivergenceReviewForm } from "@/features/salud/DivergenceReviewForm";
import { AppFrame } from "@/features/shell/AppFrame";
import { formatDateTime } from "@/features/tickets/format";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { HEALTH_CHECKS, isHealthCheckCode } from "@/server/health/health-checks";
import { getHealthOverview, type HealthFinding, type PendingDivergence } from "@/server/health/health-queries";

/**
 * Salud de HelpDesk (U10, observabilidad.md §4). Muestra lo mismo que la
 * revisión diaria, sin consultas propias sobre lo vigilado: los chequeos que
 * solo necesitan la base se calculan al cargar, y la reconciliación con
 * SharePoint se toma de la última revisión diaria, con su fecha.
 *
 * Es también donde se da por atendida una divergencia rechazada (S4): la
 * única escritura de la vista.
 *
 * Sin `salud.consultar`, la ruta responde como si no existiera.
 */

function findingTitle(finding: HealthFinding): string {
  return isHealthCheckCode(finding.chequeo) ? HEALTH_CHECKS[finding.chequeo].titulo : finding.chequeo;
}

function hoursSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 3_600_000);
}

function TicketLink({ divergence }: { divergence: PendingDivergence }) {
  return (
    <Link
      href={`/tickets/${divergence.idTicket}`}
      className={cn("rounded-control font-bold text-heading underline-offset-2 hover:underline", focusRing)}
    >
      {divergence.codigoTicket ?? "Ticket sin código"}
    </Link>
  );
}

export default async function HealthPage() {
  const employee = await requireCurrentEmployee("/salud");
  const overview = await getHealthOverview(employee.idPersonal);
  if (!overview) notFound();

  const { hallazgos, ultimaRevision } = overview;
  const worst = hallazgos[0]?.severidad ?? "VERDE";
  const criticos = hallazgos.filter((h) => h.severidad === "CRITICO").length;

  return (
    <AppFrame employee={employee} title="Salud">
      <div className="space-y-4">
        <div className={notice(HEALTH_SUMMARY_TONE[worst])} role="status">
          {hallazgos.length === 0
            ? "Todo en verde: ningún chequeo encontró nada."
            : criticos > 0
              ? `${criticos === 1 ? "Un hallazgo crítico" : `${criticos} hallazgos críticos`} y ${hallazgos.length - criticos} más por mirar.`
              : `${hallazgos.length === 1 ? "Un hallazgo" : `${hallazgos.length} hallazgos`} por mirar, ninguno crítico.`}
        </div>

        <section className={surface()} aria-labelledby="revision-titulo">
          <h2 id="revision-titulo" className={cn(sectionTitle, "mb-2")}>Revisión diaria</h2>
          {ultimaRevision ? (
            <div className="space-y-1 text-base text-ink">
              <p>
                Última: {formatDateTime(ultimaRevision.ejecutadaAt)} (hace {hoursSince(ultimaRevision.ejecutadaAt)} h).{" "}
                {ultimaRevision.criticosAvisados > 0
                  ? `Avisó por Teams ${ultimaRevision.criticosAvisados === 1 ? "un hallazgo crítico" : `${ultimaRevision.criticosAvisados} hallazgos críticos`}.`
                  : "No avisó nada por Teams."}
              </p>
              {ultimaRevision.itemsSharepoint !== null && (
                <p className="text-sm tabular-nums text-ink-muted">
                  Reconciliación: {ultimaRevision.itemsSharepoint} ítems en HelpDeskBd · {ultimaRevision.itemsStaging ?? "?"} en la base ·{" "}
                  {ultimaRevision.itemsConTicket ?? "?"} con ticket.
                </p>
              )}
            </div>
          ) : (
            <p className="text-base text-ink-muted">
              La revisión diaria no se ha ejecutado todavía. Hasta entonces, la reconciliación con SharePoint no aparece aquí.
            </p>
          )}
          <p className="mt-2 text-sm text-ink-muted">
            Corre cada día a las 7:00. A Teams solo llega lo crítico, y solo cuando aparece o empeora. El espejo en PowerApps
            está {overview.espejoActivo ? "encendido" : "apagado"}.
          </p>
        </section>

        {hallazgos.length > 0 && (
          <section className={surface({ padded: false })} aria-labelledby="hallazgos-titulo">
            <h2 id="hallazgos-titulo" className={cn(sectionTitle, "px-5 pt-5")}>Hallazgos</h2>
            <ul className="mt-3 divide-y divide-line">
              {hallazgos.map((finding) => (
                <li key={`${finding.origen}-${finding.chequeo}`} className="space-y-1 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badge(HEALTH_SEVERITY_TONE[finding.severidad])}>{HEALTH_SEVERITY_LABEL[finding.severidad]}</span>
                    <span className="font-bold text-heading">{findingTitle(finding)}</span>
                    <span className="text-sm text-ink-muted">{finding.senal}</span>
                  </div>
                  <p className="text-base text-ink">{finding.detalle}</p>
                  <p className="text-sm text-ink-muted">
                    {finding.ejemplo && <>Ejemplo: {finding.ejemplo}. </>}
                    {finding.origen === "DIARIA" && ultimaRevision && `Según la revisión diaria del ${formatDateTime(ultimaRevision.ejecutadaAt)}.`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={surface({ padded: false })} aria-labelledby="divergencias-titulo">
          <div className="px-5 pt-5">
            <h2 id="divergencias-titulo" className={sectionTitle}>Cambios de PowerApps rechazados</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Cambios hechos en PowerApps sobre tickets de HelpDesk que HelpDesk no aplicó. Dejan de contar cuando alguien los marca
              revisados.
            </p>
          </div>
          {overview.divergenciasPendientes.length === 0 ? (
            <p className="px-5 py-6 text-base text-ink-muted">Ninguno pendiente de revisar.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {overview.divergenciasPendientes.map((item) => (
                <li key={item.id} className="space-y-2 px-5 py-4">
                  <p className="text-base text-ink">
                    <TicketLink divergence={item} /> · {item.campo}: en PowerApps «{item.valorSharepoint ?? "vacío"}», en HelpDesk «
                    {item.valorHelpdesk ?? "vacío"}».
                  </p>
                  <p className="text-sm text-ink-muted">
                    No se aplicó: {item.motivo ?? "sin motivo"} · {formatDateTime(item.detectadoAt)}
                  </p>
                  {overview.puedeRevisar && <DivergenceReviewForm idDivergencia={item.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {overview.divergenciasRevisadas.length > 0 && (
          <section className={surface({ padded: false })} aria-labelledby="revisadas-titulo">
            <h2 id="revisadas-titulo" className={cn(sectionTitle, "px-5 pt-5")}>Revisadas recientemente</h2>
            <ul className="mt-3 divide-y divide-line">
              {overview.divergenciasRevisadas.map((item) => (
                <li key={item.id} className="space-y-1 px-5 py-3">
                  <p className="text-base text-ink">
                    <TicketLink divergence={item} /> · {item.campo}: «{item.valorSharepoint ?? "vacío"}»
                  </p>
                  <p className="text-sm text-ink-muted">
                    {item.revisor}, {formatDateTime(item.revisadaAt)}: {item.motivoRevision}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppFrame>
  );
}

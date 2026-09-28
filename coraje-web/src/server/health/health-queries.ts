import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { resolveGrants } from "@/server/authorization/authorizer";
import { SALUD_ACTIONS } from "@/server/authorization/catalog";

import { DAILY_ONLY_CHECKS, compareFindings, isHealthSeverity, type HealthSeverity } from "./health-checks";

/**
 * Lecturas de la vista `/salud` (U10, observabilidad.md §4). Sin
 * `salud.consultar` devuelven `null` y la vista responde como si la ruta no
 * existiera, igual que `/accesos`.
 *
 * La vista no tiene consultas propias sobre las tablas vigiladas: lee la
 * misma función que la revisión diaria (`helpdesk.salud_hallazgos`), así que
 * lo que ve una persona y lo que avisa Teams no pueden divergir. Solo la
 * lista de divergencias pendientes se lee aparte, porque la vista necesita
 * cada fila para poder marcarla.
 */

export interface HealthFinding {
  senal: string;
  /** Normalmente un `HealthCheckCode`; se acepta otro para no ocultar un chequeo nuevo de la base. */
  chequeo: string;
  severidad: HealthSeverity;
  cantidad: number;
  detalle: string;
  ejemplo: string | null;
  /** `VIVO`: calculado ahora. `DIARIA`: de la última revisión diaria. */
  origen: "VIVO" | "DIARIA";
}

export interface DailyReview {
  ejecutadaAt: Date;
  origen: string;
  itemsSharepoint: number | null;
  itemsStaging: number | null;
  itemsConTicket: number | null;
  /** Críticos que esa revisión avisó por Teams (nuevos o peores que la anterior). */
  criticosAvisados: number;
}

export interface PendingDivergence {
  id: string;
  idTicket: string;
  codigoTicket: string | null;
  campo: string;
  valorHelpdesk: string | null;
  valorSharepoint: string | null;
  motivo: string | null;
  detectadoAt: Date;
}

export interface ReviewedDivergence extends PendingDivergence {
  revisadaAt: Date;
  revisor: string;
  motivoRevision: string;
}

export interface HealthOverview {
  hallazgos: HealthFinding[];
  ultimaRevision: DailyReview | null;
  espejoActivo: boolean;
  divergenciasPendientes: PendingDivergence[];
  divergenciasRevisadas: ReviewedDivergence[];
  /** `salud.divergencia.revisar`: la vista ofrece el formulario solo con él. */
  puedeRevisar: boolean;
}

const PENDING_LIMIT = 50;
const REVIEWED_LIMIT = 10;

/** Forma de cada fila de `revision_salud.hallazgos`: la escribe la base, pero se valida al leer. */
const storedFindingSchema = z.object({
  senal: z.string(),
  chequeo: z.string(),
  severidad: z.string(),
  cantidad: z.number().int(),
  detalle: z.string(),
  ejemplo: z.string().nullable().optional(),
});

function toFinding(
  row: { senal: string; chequeo: string; severidad: string; cantidad: number; detalle: string; ejemplo?: string | null },
  origen: HealthFinding["origen"],
): HealthFinding {
  return {
    senal: row.senal,
    chequeo: row.chequeo,
    // Una severidad desconocida se muestra como la más grave: ante la duda,
    // que se vea.
    severidad: isHealthSeverity(row.severidad) ? row.severidad : "CRITICO",
    cantidad: row.cantidad,
    detalle: row.detalle,
    ejemplo: row.ejemplo ?? null,
    origen,
  };
}

const divergenceSelect = {
  id: true,
  idTicket: true,
  campo: true,
  valorHelpdesk: true,
  valorSharepoint: true,
  motivo: true,
  detectadoAt: true,
  factTicket: { select: { codigoTicket: true } },
} as const;

export async function getHealthOverview(idPersonal: string): Promise<HealthOverview | null> {
  const grants = await resolveGrants(idPersonal, [SALUD_ACTIONS.consultar, SALUD_ACTIONS.revisarDivergencia]);
  if (!grants.has(SALUD_ACTIONS.consultar)) return null;

  const [vivos, revision, espejo, pendientes, revisadas] = await Promise.all([
    prisma.$queryRaw<{ senal: string; chequeo: string; severidad: string; cantidad: number; detalle: string; ejemplo: string | null }[]>`
      SELECT senal, chequeo, severidad, cantidad, detalle, ejemplo FROM helpdesk.salud_hallazgos()
    `,
    prisma.revisionSalud.findFirst({ orderBy: { ejecutadaAt: "desc" } }),
    prisma.espejoSharepoint.findUnique({ where: { id: true }, select: { activoDesde: true } }),
    prisma.syncDivergencia.findMany({
      where: { resultado: "RECHAZADO", revisadaAt: null },
      orderBy: { detectadoAt: "asc" },
      take: PENDING_LIMIT,
      select: divergenceSelect,
    }),
    prisma.syncDivergencia.findMany({
      where: { revisadaAt: { not: null } },
      orderBy: { revisadaAt: "desc" },
      take: REVIEWED_LIMIT,
      select: { ...divergenceSelect, revisadaAt: true, motivoRevision: true, revisor: { select: { nombreCompleto: true } } },
    }),
  ]);

  // De la revisión diaria solo se toma lo que la vista no puede calcular.
  // El resto ya está en `vivos`, más reciente.
  const diarios: HealthFinding[] = [];
  if (revision) {
    const parsed = z.array(storedFindingSchema).safeParse(revision.hallazgos);
    if (parsed.success) {
      for (const row of parsed.data) {
        if ((DAILY_ONLY_CHECKS as readonly string[]).includes(row.chequeo)) diarios.push(toFinding(row, "DIARIA"));
      }
    }
  }

  const criticos = z.array(z.unknown()).safeParse(revision?.criticosNuevos);

  return {
    hallazgos: [...vivos.map((row) => toFinding(row, "VIVO")), ...diarios].sort(compareFindings),
    ultimaRevision: revision
      ? {
          ejecutadaAt: revision.ejecutadaAt,
          origen: revision.origen,
          itemsSharepoint: revision.itemsSharepoint,
          itemsStaging: revision.itemsStaging,
          itemsConTicket: revision.itemsConTicket,
          criticosAvisados: criticos.success ? criticos.data.length : 0,
        }
      : null,
    espejoActivo: espejo?.activoDesde != null,
    divergenciasPendientes: pendientes.map(({ factTicket, ...row }) => ({ ...row, codigoTicket: factTicket.codigoTicket })),
    divergenciasRevisadas: revisadas.map(({ factTicket, revisor, revisadaAt, motivoRevision, ...row }) => ({
      ...row,
      codigoTicket: factTicket.codigoTicket,
      // chk_sync_divergencia_revision: las tres columnas van juntas.
      revisadaAt: revisadaAt ?? row.detectadoAt,
      revisor: revisor?.nombreCompleto ?? "Persona desconocida",
      motivoRevision: motivoRevision ?? "",
    })),
    puedeRevisar: grants.has(SALUD_ACTIONS.revisarDivergencia),
  };
}

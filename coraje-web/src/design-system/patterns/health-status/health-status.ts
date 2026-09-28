import type { HealthSeverity } from "@/server/health/health-checks";

import type { BadgeTone } from "../../recipes/badge";
import type { NoticeTone } from "../../recipes/surface";

/**
 * Autoridad única que traduce la severidad de un hallazgo de salud a tono y
 * a palabra (U10), como `ticket-status.ts` lo hace con estado y plazo.
 * `Record` exhaustivo: una severidad nueva sin decidir aquí su tono no
 * compila.
 *
 * El peligro queda para lo crítico, que es también lo único que avisa por
 * Teams: la vista y el canal dicen lo mismo con el mismo énfasis.
 */
export const HEALTH_SEVERITY_TONE: Record<HealthSeverity, BadgeTone> = {
  CRITICO: "danger",
  ATENCION: "warning",
  AVISO: "neutral",
};

export const HEALTH_SEVERITY_LABEL: Record<HealthSeverity, string> = {
  CRITICO: "Crítico",
  ATENCION: "Atención",
  AVISO: "Aviso",
};

/** Resumen de la cabecera de la vista: el peor hallazgo decide el tono. */
export const HEALTH_SUMMARY_TONE: Record<HealthSeverity | "VERDE", NoticeTone> = {
  CRITICO: "danger",
  ATENCION: "warning",
  AVISO: "info",
  VERDE: "success",
};

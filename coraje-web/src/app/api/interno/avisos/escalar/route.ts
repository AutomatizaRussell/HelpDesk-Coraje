import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { escalatePendingNotices } from "@/server/notifications/notice-escalation";
import { logEvent } from "@/server/observability/log";

/**
 * Disparo del escalamiento diario de avisos (U15, specs/tickets.md §12.3).
 * Lo llama el workflow `n8n/HELPDESK - Escalar avisos V1.json` una vez al día.
 *
 * Es pública en el perímetro (`public-paths.ts`) porque quien llama no es una
 * persona con sesión, sino n8n. La credencial es la cabecera
 * `x-helpdesk-secret`, que debe coincidir con `HELPDESK_ESCALAR_AVISOS_SECRET`.
 * Sin la variable, la ruta responde 503 a todo: una ruta pública con el
 * secreto vacío aceptaría cualquier cabecera vacía.
 *
 * Qué puede hacer quien la llame con el secreto: pedir que se escale hoy lo
 * que la base considera escalable. Nada más: no recibe datos de vuelta, solo
 * los conteos, y llamarla dos veces no repite ningún correo (la base es
 * idempotente por persona y día).
 *
 * Responde 502 si algún correo falló, para que la ejecución de n8n falle y el
 * workflow de error avise en Teams: un escalamiento que no llega es un
 * pendiente que nadie ve.
 */

/**
 * Compara con el mismo tiempo sin importar dónde difieran. Se compara el
 * resumen y no el valor, para que tampoco el largo del secreto se filtre.
 */
function secretMatches(received: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

export async function POST(request: Request) {
  const expected = process.env.HELPDESK_ESCALAR_AVISOS_SECRET?.trim();
  if (!expected) {
    logEvent("error", "avisos.escalamiento_sin_configurar", {});
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const received = request.headers.get("x-helpdesk-secret")?.trim() ?? "";
  if (!secretMatches(received, expected)) {
    logEvent("warn", "avisos.escalamiento_no_autorizado", {});
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const summary = await escalatePendingNotices();
    return NextResponse.json({ ok: summary.fallidos === 0, ...summary }, { status: summary.fallidos === 0 ? 200 : 502 });
  } catch (error) {
    logEvent("error", "avisos.escalamiento_error", {}, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

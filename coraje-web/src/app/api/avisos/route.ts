import { NextResponse } from "next/server";

import type { BellNoticesResponse } from "@/features/avisos/bell-types";
import { formatDateTime } from "@/features/tickets/format";
import { getCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { AVISO_ACTIONS } from "@/server/authorization/catalog";
import { listBellNotices } from "@/server/notifications/ticket-notices";

/**
 * Lo que muestra la campana al abrirse (U15). Solo lectura y solo los avisos
 * de quien la pide. La pide el navegador al abrir el panel, no en cada
 * página: el número ya llega con la página (`AppFrame`).
 *
 * Sin sesión, 401; sin `aviso.consultar`, 403. Nunca se guarda en caché: son
 * datos de una persona.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  if (!(await resolveGrant(employee.idPersonal, AVISO_ACTIONS.consultar))) {
    return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE });
  }

  const bell = await listBellNotices(employee.idPersonal);
  const body: BellNoticesResponse = {
    sinLeer: bell.sinLeer,
    atencion: bell.atencion,
    items: bell.items.map((item) => ({
      id: item.id,
      titulo: item.titulo,
      detalle: item.detalle,
      fecha: formatDateTime(item.fecha),
      leido: item.leido,
      atencion: item.clase === "ATENCION",
    })),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}

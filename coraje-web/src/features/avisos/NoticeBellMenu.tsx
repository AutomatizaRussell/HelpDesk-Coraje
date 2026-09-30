"use client";

import { useRef, useState } from "react";

import { NoticeBell } from "@/design-system/patterns/notice-bell/NoticeBell";
import { NoticeListItem } from "@/design-system/patterns/notice-bell/NoticeListItem";
import { APP_BASE_PATH } from "@/server/auth/base-path";

import { openNoticeAction } from "./actions";
import type { BellNoticesResponse } from "./bell-types";

/**
 * La campana con su panel (U15). El número llega con la página; la lista se
 * pide al abrir el panel, cada vez que se abre, para que muestre lo último
 * sin que ninguna página pague por ella. No hay sondeo: entre una apertura y
 * otra no se consulta nada.
 */
type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: BellNoticesResponse };

export function NoticeBellMenu({ count, anchor }: { count: number; anchor: "topbar" | "appBar" }) {
  const [panel, setPanel] = useState<PanelState>({ status: "idle" });
  // Una apertura nueva descarta la respuesta de la anterior si llega tarde.
  const requestRef = useRef(0);

  const load = async () => {
    const request = ++requestRef.current;
    setPanel((current) => (current.status === "ready" ? current : { status: "loading" }));
    try {
      // `fetch` no aplica el basePath de Next: la ruta va completa.
      const response = await fetch(`${APP_BASE_PATH}/api/avisos`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as BellNoticesResponse;
      if (request === requestRef.current) setPanel({ status: "ready", data });
    } catch {
      if (request === requestRef.current) setPanel({ status: "error" });
    }
  };

  // Mientras no se abre por primera vez, manda el número de la página; después,
  // el de la última lectura, que es más reciente.
  const shownCount = panel.status === "ready" ? panel.data.sinLeer : count;

  return (
    <NoticeBell count={shownCount} anchor={anchor} allHref="/avisos" onOpen={load}>
      <div className="max-h-96 overflow-y-auto">
        {(panel.status === "idle" || panel.status === "loading") && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted" role="status">
            Cargando avisos…
          </p>
        )}
        {panel.status === "error" && (
          <div className="px-4 py-6 text-center text-sm text-ink-muted" role="alert">
            <p>No fue posible cargar los avisos.</p>
            <button type="button" onClick={load} className="mt-2 font-bold text-heading underline underline-offset-2">
              Intentar de nuevo
            </button>
          </div>
        )}
        {panel.status === "ready" &&
          (panel.data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">No tienes avisos pendientes ni sin leer.</p>
          ) : (
            <ul className="divide-y divide-line">
              {panel.data.items.map((item) => (
                <NoticeListItem
                  key={item.id}
                  id={item.id}
                  title={item.titulo}
                  detail={item.detalle}
                  meta={item.fecha}
                  unread={!item.leido}
                  attention={item.atencion}
                  action={openNoticeAction}
                />
              ))}
            </ul>
          ))}
      </div>
    </NoticeBell>
  );
}

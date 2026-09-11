import type { TicketListItem } from "../types";

type TicketsTableProps = {
  tickets: TicketListItem[];
};

/**
 * Formatea fechas para visualización operativa.
 *
 * La función recibe null porque varias fechas del modelo son opcionales:
 * - fecha_limite puede faltar si no se calculó SLA.
 * - fecha_resolucion puede faltar si el ticket sigue abierto.
 */
function formatDate(date: Date | null): string {
  if (!date) {
    return "Sin fecha";
  }

  return date.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Tabla de tickets.
 *
 * Este componente es puramente presentacional:
 * - no conoce Prisma;
 * - no ejecuta consultas;
 * - no decide reglas de negocio;
 * - solo renderiza el DTO recibido desde la capa data.
 *
 * La estructura visual toma como referencia el prototipo HTML legacy,
 * pero sin copiar su lógica espagueti: aquí solo hay render declarativo
 * y datos ya preparados por la capa `getTickets`.
 */
export function TicketsTable({ tickets }: TicketsTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-[#e2e8f0] bg-white p-10 text-center text-sm font-semibold text-[#718096] shadow-[var(--card-shadow)]">
        No hay tickets disponibles para mostrar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#e2e8f0] bg-white shadow-[var(--card-shadow)]">
      <div className="max-h-[650px] overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#00a9ce] text-left text-xs font-bold uppercase tracking-wide text-white">
            <tr>
              <th className="whitespace-nowrap px-5 py-4">Código</th>
              <th className="whitespace-nowrap px-5 py-4">Descripción</th>
              <th className="whitespace-nowrap px-5 py-4">Cliente</th>
              <th className="whitespace-nowrap px-5 py-4">Área</th>
              <th className="whitespace-nowrap px-5 py-4">Tipo</th>
              <th className="whitespace-nowrap px-5 py-4">Estado</th>
              <th className="whitespace-nowrap px-5 py-4">Prioridad</th>
              <th className="whitespace-nowrap px-5 py-4">Creación</th>
              <th className="whitespace-nowrap px-5 py-4">Límite</th>
              <th className="whitespace-nowrap px-5 py-4">Origen</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#e2e8f0]">
            {tickets.map((ticket) => (
              <tr
                key={ticket.idTicket}
                className="border-l-4 border-transparent text-zinc-700 transition hover:scale-[1.002] hover:border-[#00a9ce] hover:bg-[#f0f9ff]"
              >
                <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-bold text-[#001871]">
                  {ticket.codigoTicket ?? "Sin código"}
                </td>

                <td className="max-w-xl px-5 py-4 font-semibold text-zinc-900">
                  <span className="line-clamp-2">{ticket.descripcion}</span>
                </td>

                <td className="px-5 py-4 font-semibold text-[#001871]">
                  {ticket.cliente}
                </td>

                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full border border-[#e2e8f0] bg-[#edf2f7] px-3 py-1 text-xs font-bold text-[#4a5568]">
                    {ticket.area}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <div className="max-w-xs">
                    <p className="font-bold text-zinc-800">
                      {ticket.tipoRequerimiento}
                    </p>

                    <p className="mt-1 text-xs font-medium text-[#718096]">
                      {ticket.categoria1} / {ticket.categoria2}
                    </p>
                  </div>
                </td>

                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full border border-[#e2e8f0] bg-[#edf2f7] px-3 py-1 text-xs font-bold text-[#4a5568]">
                    {ticket.estado}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <span className="inline-flex rounded-full border border-[rgba(237,139,0,0.2)] bg-[rgba(237,139,0,0.12)] px-3 py-1 text-xs font-bold text-[#b36900]">
                    {ticket.prioridad}
                  </span>
                </td>

                <td className="whitespace-nowrap px-5 py-4 font-medium text-[#718096]">
                  {formatDate(ticket.fechaCreacion)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 font-medium text-[#718096]">
                  {formatDate(ticket.fechaLimite)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-[#718096]">
                  {ticket.origenSistema}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
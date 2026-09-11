"use client";

import { useMemo, useRef, useState } from "react";


import { selectClientAction } from "@/app/portal/actions";

type ClientListItem = {
  idClienteContai: string;
  nombreCliente: string;
  identificacionFiscal: string | null;
  tipoCliente: string | null;
  grupoEconomico: string | null;
};

type ClientSearchResponse = {
  items: ClientListItem[];
  nextPage: number | null;
};

type ClientSelectorProps = {
  initialClients: ClientListItem[];
  initialSearch?: string;
};

/**
 * Selector temporal de cliente.
 *
 * Comportamiento:
 * - input de búsqueda;
 * - dropdown con resultados;
 * - búsqueda server-side contra PostgreSQL;
 * - paginación incremental de 25 en 25 al bajar el scroll;
 * - selección de cliente con hidden input para server action.
 *
 * Esto NO es autenticación real.
 */
export function ClientSelector({

  initialClients,
  initialSearch = "",
}: ClientSelectorProps) {
  const [query, setQuery] = useState(initialSearch);
  const [clients, setClients] = useState<ClientListItem[]>(initialClients);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(
    initialClients.length >= 25 ? 1 : null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const selectedClientLabel = useMemo(() => {
    if (!selectedClient) {
      return "";
    }

    return `${selectedClient.nombreCliente} · ${selectedClient.identificacionFiscal ?? "Sin NIT"
      }`;
  }, [selectedClient]);

  async function fetchClients({
    search,
    page,
    append,
  }: {
    search: string;
    page: number;
    append: boolean;
  }) {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        search,
        page: String(page),
        pageSize: "25",
      });

      const response = await fetch(`/api/portal/clientes?${params.toString()}`);

      if (!response.ok) {
        throw new Error("No fue posible buscar clientes.");
      }

      const data = (await response.json()) as ClientSearchResponse;

      setClients((current) => {
        if (!append) {
          return data.items;
        }

        /**
         * Evita duplicados si dos requests se solapan o si el usuario
         * dispara carga incremental varias veces.
         */
        const byId = new Map<string, ClientListItem>();

        for (const item of current) {
          byId.set(item.idClienteContai, item);
        }

        for (const item of data.items) {
          byId.set(item.idClienteContai, item);
        }

        return Array.from(byId.values());
      });

      setNextPage(data.nextPage);
    } finally {
      setIsLoading(false);
    }
  }

  function openDropdownAndEnsureResults() {
    setIsOpen(true);

    if (!isLoading && clients.length === 0) {
      void fetchClients({
        search: query,
        page: 0,
        append: false,
      });
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedClient(null);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    /**
     * Debounce simple para no disparar una consulta por cada tecla exacta.
     * 250ms es suficiente para un selector interno de clientes.
     */
    debounceRef.current = setTimeout(() => {
      void fetchClients({
        search: value,
        page: 0,
        append: false,
      });
    }, 250);
  }

  function handleSelectClient(client: ClientListItem) {
    setSelectedClient(client);
    setQuery(
      `${client.nombreCliente} · ${client.identificacionFiscal ?? "Sin NIT"}`,
    );
    setIsOpen(false);
  }

  function handleDropdownScroll(event: React.UIEvent<HTMLDivElement>) {
    if (isLoading || nextPage === null) {
      return;
    }

    const element = event.currentTarget;
    const distanceToBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    if (distanceToBottom < 48) {
      void fetchClients({
        search: query,
        page: nextPage,
        append: true,
      });
    }
  }


  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#718096]">
          Portal de clientes
        </p>

        <h1 className="text-3xl font-black tracking-tight text-[#001871]">
          Selecciona un cliente
        </h1>

        <p className="text-sm font-medium text-[#718096]">
          Busca por nombre, NIT o grupo económico para continuar.
        </p>
      </header>

      <form
        action={selectClientAction}
        className="space-y-5 rounded-[20px] border border-[#e2e8f0] bg-white p-6 shadow-[var(--card-shadow)]"
      >
        <input
          type="hidden"
          name="clientId"
          value={selectedClient?.idClienteContai ?? ""}
        />

        <div className="relative">
          <label
            htmlFor="clientSearch"
            className="text-xs font-bold uppercase tracking-wide text-[#001871]"
          >
            Cliente
          </label>

          <input
            id="clientSearch"
            type="text"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onFocus={openDropdownAndEnsureResults}
            onClick={openDropdownAndEnsureResults}
            onMouseDown={() => {
              setIsOpen(true);
            }}
            placeholder="Escribe el nombre o NIT del cliente..."
            autoComplete="off"
            className="mt-2 h-12 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 text-sm font-semibold text-[#2d3748] outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100"
          />

          {isOpen && (
            <div
              onScroll={handleDropdownScroll}
              className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-[#e2e8f0] bg-white shadow-xl"
            >
              {clients.length === 0 ? (
                <div className="p-4 text-sm font-semibold text-[#718096]">
                  {isLoading
                    ? "Buscando clientes..."
                    : "No se encontraron coincidencias."}
                </div>
              ) : (
                <ul className="divide-y divide-[#e2e8f0]">
                  {clients.map((client) => (
                    <li key={client.idClienteContai}>
                      <button
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className="block w-full px-4 py-3 text-left transition hover:bg-[#f0f9ff]"
                      >
                        <span className="block text-sm font-black text-[#001871]">
                          {client.nombreCliente}
                        </span>

                        <span className="mt-1 block text-xs font-semibold text-[#718096]">
                          NIT / ID:{" "}
                          {client.identificacionFiscal ?? "Sin dato"}
                        </span>

                        <span className="mt-1 block text-xs font-medium text-zinc-400">
                          {client.tipoCliente ?? "Sin tipo"} ·{" "}
                          {client.grupoEconomico ?? "Sin grupo"}
                        </span>
                      </button>
                    </li>
                  ))}

                  {isLoading && (
                    <li className="p-4 text-center text-xs font-bold uppercase tracking-wide text-[#718096]">
                      Cargando más clientes...
                    </li>
                  )}

                  {!isLoading && nextPage === null && clients.length > 0 && (
                    <li className="p-4 text-center text-xs font-bold uppercase tracking-wide text-zinc-400">
                      No hay más resultados
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {selectedClient && (
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">
              Cliente seleccionado
            </p>

            <p className="mt-2 text-sm font-black text-[#001871]">
              {selectedClientLabel}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedClient}
          className="w-full rounded-xl bg-gradient-to-r from-[#ed8b00] to-[#d17a00] px-5 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ingresar al portal
        </button>
      </form>
    </section>
  );
}


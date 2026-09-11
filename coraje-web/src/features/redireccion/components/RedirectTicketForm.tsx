"use client";

import { useMemo, useState } from "react";

type AreaOption = {
  idArea: string;
  nombreArea: string;
};

type TipoRequerimientoOption = {
  idTipoReq: string;
  idArea: string;
  tipoRequerimiento: string;
  categoria1: string | null;
  categoria2: string | null;
};

type RedirectTicketFormProps = {
  ticketId: string;
  areas: AreaOption[];
  tiposRequerimiento: TipoRequerimientoOption[];
  action: (formData: FormData) => Promise<void>;
};

/**
 * Normaliza valores opcionales del catálogo.
 *
 * En datos legacy pueden venir null, cadena vacía o espacios.
 * Para la UI todo eso debe tratarse como "sin valor".
 */
function cleanOptionalValue(value: string | null): string {
  return value?.trim() ?? "";
}

/**
 * Determina si una fila del catálogo no tiene categoría 1 ni categoría 2.
 */
function isTipoSinCategorias(item: TipoRequerimientoOption): boolean {
  return (
    cleanOptionalValue(item.categoria1) === "" &&
    cleanOptionalValue(item.categoria2) === ""
  );
}

/**
 * Formatea etiquetas legacy normalizadas para visualización.
 *
 * No modifica el valor real enviado ni compara contra este texto.
 * Solo mejora la presentación en los selects.
 */
function formatCatalogLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es-CO")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      /**
       * Mantiene siglas comunes en mayúscula.
       * Puedes ampliar esta lista si aparecen más casos del catálogo.
       */
      const upperWord = word.toLocaleUpperCase("es-CO");

      if (["IVA", "ICA", "RUT", "TI", "BPO", "SST"].includes(upperWord)) {
        return upperWord;
      }

      return word.charAt(0).toLocaleUpperCase("es-CO") + word.slice(1);
    })
    .join(" ");
}

/**
 * Formulario de redirección interna.
 *
 * La selección funciona en cascada:
 * área → tipo → categoría 1 → categoría 2.
 *
 * El formulario realmente envía:
 * - ticketId
 * - areaId
 * - tipoReqId
 *
 * No envía textos de categoría porque la combinación final ya está representada
 * por idTipoReq.
 */
export function RedirectTicketForm({
  ticketId,
  areas,
  tiposRequerimiento,
  action,
}: RedirectTicketFormProps) {
  const [areaId, setAreaId] = useState("");
  const [tipo, setTipo] = useState("");
  const [categoria1, setCategoria1] = useState("");
  const [categoria2, setCategoria2] = useState("");
  const [tipoReqId, setTipoReqId] = useState("");
  const [showDisableReason, setShowDisableReason] = useState(false);

  const tiposDisponibles = useMemo(() => {
    if (!areaId) {
      return [];
    }

    return Array.from(
      new Set(
        tiposRequerimiento
          .filter((item) => item.idArea === areaId)
          .map((item) => item.tipoRequerimiento),
      ),
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [areaId, tiposRequerimiento]);

  const categorias1Disponibles = useMemo(() => {
    if (!areaId || !tipo) {
      return [];
    }

    return Array.from(
      new Set(
        tiposRequerimiento
          .filter(
            (item) =>
              item.idArea === areaId && item.tipoRequerimiento === tipo,
          )
          .map((item) => cleanOptionalValue(item.categoria1))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [areaId, tipo, tiposRequerimiento]);

  const categorias2Disponibles = useMemo(() => {
    if (!areaId || !tipo || !categoria1) {
      return [];
    }

    return Array.from(
      new Set(
        tiposRequerimiento
          .filter(
            (item) =>
              item.idArea === areaId &&
              item.tipoRequerimiento === tipo &&
              cleanOptionalValue(item.categoria1) === categoria1,
          )
          .map((item) => cleanOptionalValue(item.categoria2))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [areaId, tipo, categoria1, tiposRequerimiento]);

  function resetFromArea(nextAreaId: string) {
    setAreaId(nextAreaId);
    setTipo("");
    setCategoria1("");
    setCategoria2("");
    setTipoReqId("");
  }

  function resetFromTipo(nextTipo: string) {
    setTipo(nextTipo);
    setCategoria1("");
    setCategoria2("");
    setTipoReqId("");

    const matches = tiposRequerimiento.filter(
      (item) => item.idArea === areaId && item.tipoRequerimiento === nextTipo,
    );

    /**
     * Caso 1:
     * El tipo no tiene categoría 1 ni categoría 2.
     * Ejemplo:
     *   ADMINISTRACIÓN-RECEPCIÓN / asignacion agenda / null / null
     *
     * En este caso, seleccionar el tipo ya resuelve idTipoReq.
     */
    const tipoSinCategorias = matches.find(isTipoSinCategorias);

    if (tipoSinCategorias) {
      setTipoReqId(tipoSinCategorias.idTipoReq);
      return;
    }

    /**
     * Caso 2:
     * Solo hay una fila para área + tipo.
     * No hay ambigüedad, aunque el catálogo esté incompleto.
     */
    if (matches.length === 1) {
      setCategoria1(cleanOptionalValue(matches[0].categoria1));
      setCategoria2(cleanOptionalValue(matches[0].categoria2));
      setTipoReqId(matches[0].idTipoReq);
    }
  }

  function resetFromCategoria1(nextCategoria1: string) {
    setCategoria1(nextCategoria1);
    setCategoria2("");
    setTipoReqId("");

    const matches = tiposRequerimiento.filter(
      (item) =>
        item.idArea === areaId &&
        item.tipoRequerimiento === tipo &&
        cleanOptionalValue(item.categoria1) === nextCategoria1,
    );

    /**
     * Caso 1:
     * Existe una fila explícita sin categoría 2.
     * Entonces categoría 2 es realmente opcional y podemos guardar esa fila.
     */
    const matchSinCategoria2 = matches.find(
      (item) => cleanOptionalValue(item.categoria2) === "",
    );

    if (matchSinCategoria2) {
      setTipoReqId(matchSinCategoria2.idTipoReq);
      return;
    }

    /**
     * Caso 2:
     * Solo hay una fila para área + tipo + categoría 1.
     * No hay ambigüedad.
     */
    if (matches.length === 1) {
      setCategoria2(cleanOptionalValue(matches[0].categoria2));
      setTipoReqId(matches[0].idTipoReq);
    }
  }

  function selectCategoria2(nextCategoria2: string) {
    setCategoria2(nextCategoria2);

    const match = tiposRequerimiento.find(
      (item) =>
        item.idArea === areaId &&
        item.tipoRequerimiento === tipo &&
        cleanOptionalValue(item.categoria1) === categoria1 &&
        cleanOptionalValue(item.categoria2) === nextCategoria2,
    );

    setTipoReqId(match?.idTipoReq ?? "");
  }

  const categoria2EsNecesariaPorAmbiguedad =
    Boolean(areaId && tipo && categoria1) &&
    categorias2Disponibles.length > 0 &&
    !tipoReqId;

  const disableReason = (() => {
    if (!areaId) {
      return "Selecciona un área destino.";
    }

    if (!tipo) {
      return "Selecciona un tipo de requerimiento.";
    }

    if (categorias1Disponibles.length > 0 && !categoria1) {
      return "Selecciona una categoría 1.";
    }

    if (categoria2EsNecesariaPorAmbiguedad) {
      return "Selecciona categoría 2 para resolver la clasificación exacta.";
    }

    if (!tipoReqId) {
      return "No se pudo resolver una combinación válida.";
    }

    return "";
  })();

  const canSubmit = disableReason === "";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="areaId" value={areaId} />
      <input type="hidden" name="tipoReqId" value={tipoReqId} />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="areaId"
            className="text-xs font-bold uppercase tracking-wide text-[#001871]"
          >
            Área destino
          </label>

          <select
            id="areaId"
            value={areaId}
            onChange={(event) => resetFromArea(event.target.value)}
            required
            className="mt-2 h-12 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 text-sm font-semibold outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100"
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.idArea} value={area.idArea}>
                {area.nombreArea}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="tipo"
            className="text-xs font-bold uppercase tracking-wide text-[#001871]"
          >
            Tipo de requerimiento
          </label>

          <select
            id="tipo"
            value={tipo}
            onChange={(event) => resetFromTipo(event.target.value)}
            required
            disabled={!areaId}
            className="mt-2 h-12 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 text-sm font-semibold outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Selecciona un tipo</option>
            {tiposDisponibles.map((tipoItem) => (
              <option key={tipoItem} value={tipoItem}>
                {formatCatalogLabel(tipoItem)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="categoria1"
            className="text-xs font-bold uppercase tracking-wide text-[#001871]"
          >
            Categoría 1
          </label>

          <select
            id="categoria1"
            value={categoria1}
            onChange={(event) => resetFromCategoria1(event.target.value)}
            disabled={!tipo || categorias1Disponibles.length === 0}
            className="mt-2 h-12 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 text-sm font-semibold outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {categorias1Disponibles.length === 0
                ? "No aplica"
                : "Selecciona categoría 1"}
            </option>
            {categorias1Disponibles.map((categoria) => (
              <option key={categoria} value={categoria}>
                {formatCatalogLabel(categoria)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="categoria2"
            className="text-xs font-bold uppercase tracking-wide text-[#001871]"
          >
            Categoría 2
          </label>

          <select
            id="categoria2"
            value={categoria2}
            onChange={(event) => selectCategoria2(event.target.value)}
            disabled={categorias2Disponibles.length === 0}
            className="mt-2 h-12 w-full rounded-xl border-2 border-[#e2e8f0] bg-[#f8fafc] px-4 text-sm font-semibold outline-none transition focus:border-[#00a9ce] focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {categorias2Disponibles.length === 0
                ? "No aplica"
                : "Selecciona categoría 2"}
            </option>

            {categorias2Disponibles.map((categoria) => (
              <option key={categoria} value={categoria}>
                {formatCatalogLabel(categoria)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <div
          className="relative inline-flex"

          onClick={() => {
            if (!canSubmit) {
              setShowDisableReason(true);
            }
          }}

          onMouseEnter={() => {
            if (!canSubmit) {
              setShowDisableReason(true);
            }
          }}
          onMouseLeave={() => {
            setShowDisableReason(false);
          }}
          onFocus={() => {
            if (!canSubmit) {
              setShowDisableReason(true);
            }
          }}
          onBlur={() => {
            setShowDisableReason(false);
          }}
        >
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            aria-describedby={!canSubmit ? "redirect-disable-reason" : undefined}
            className="rounded-xl bg-gradient-to-r from-[#ed8b00] to-[#d17a00] px-5 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar redirección
          </button>

          {!canSubmit && showDisableReason && (
            <div
              id="redirect-disable-reason"
              role="tooltip"
              className="absolute bottom-full right-0 z-50 mb-3 w-72 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3 text-sm font-semibold leading-5 text-[#001871] shadow-xl"
            >
              <div className="absolute -bottom-1 right-6 h-3 w-3 rotate-45 border-b border-r border-[#e2e8f0] bg-white" />
              {disableReason}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
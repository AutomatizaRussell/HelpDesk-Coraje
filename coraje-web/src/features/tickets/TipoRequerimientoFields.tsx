"use client";

import { useMemo, useState } from "react";

import { fieldControl, fieldError, fieldLabel } from "@/design-system/recipes/field";
import type { CreationCatalog } from "@/server/tickets/ticket-queries";

/**
 * Selección en cascada área → tipo → categoría 1 → categoría 2, que resuelve
 * un único tipo de requerimiento. La usan crear un ticket interno (T2) y
 * clasificar uno del portal (T3): en los dos casos el tipo es lo que decide
 * el área y, con la regla de enrutamiento, la persona responsable.
 *
 * Se resuelve en el navegador sobre el catálogo completo, porque son unas
 * decenas de filas y pedirlas por partes costaría una ida al servidor por
 * cada selección. Lo que el formulario envía es solo `idTipoReq`, en un campo
 * oculto: el área y el responsable los decide la base, no el formulario.
 */
type Catalog = Pick<CreationCatalog, "areas" | "tipos">;

/** `null` de categoría se representa como cadena vacía en los `<select>`. */
const key = (value: string | null) => value ?? "";

function distinct(values: (string | null)[]): (string | null)[] {
  return [...new Set(values.map(key))].map((value) => (value === "" ? null : value));
}

export function TipoRequerimientoFields({
  catalog,
  initialIdTipoReq,
  error,
}: {
  catalog: Catalog;
  /** Tipo enviado en un intento fallido, para reconstruir la selección. */
  initialIdTipoReq?: string;
  error?: string;
}) {
  const previous = catalog.tipos.find((tipo) => tipo.idTipoReq === initialIdTipoReq);
  const [idArea, setIdArea] = useState(previous?.idArea ?? "");
  const [tipo, setTipo] = useState(previous?.tipo ?? "");
  const [categoria1, setCategoria1] = useState(key(previous?.categoria1 ?? null));
  const [categoria2, setCategoria2] = useState(key(previous?.categoria2 ?? null));

  const inArea = useMemo(() => catalog.tipos.filter((row) => row.idArea === idArea), [catalog.tipos, idArea]);
  const inTipo = useMemo(() => inArea.filter((row) => row.tipo === tipo), [inArea, tipo]);
  const categorias1 = useMemo(() => distinct(inTipo.map((row) => row.categoria1)), [inTipo]);
  const inCategoria1 = useMemo(() => inTipo.filter((row) => key(row.categoria1) === categoria1), [inTipo, categoria1]);
  const categorias2 = useMemo(() => distinct(inCategoria1.map((row) => row.categoria2)), [inCategoria1]);
  const tipos = useMemo(() => [...new Set(inArea.map((row) => row.tipo))], [inArea]);

  // Una categoría que solo tiene el valor vacío no se pregunta: no hay nada
  // que elegir.
  const askCategoria1 = categorias1.some((value) => value !== null);
  const askCategoria2 = categorias2.some((value) => value !== null);

  const resolved = inCategoria1.find((row) => key(row.categoria2) === categoria2);

  return (
    <>
      <div>
        <label htmlFor="area" className={fieldLabel}>Área que atiende</label>
        <select
          id="area"
          className={fieldControl()}
          value={idArea}
          onChange={(event) => {
            setIdArea(event.target.value);
            setTipo("");
            setCategoria1("");
            setCategoria2("");
          }}
        >
          <option value="">Elige un área</option>
          {catalog.areas.map((area) => (
            <option key={area.idArea} value={area.idArea}>{area.nombre}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tipo" className={fieldLabel}>Tipo de requerimiento</label>
        <select
          id="tipo"
          className={fieldControl({ invalid: Boolean(error) })}
          value={tipo}
          disabled={!idArea}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "idTipoReq-error" : undefined}
          onChange={(event) => {
            setTipo(event.target.value);
            setCategoria1("");
            setCategoria2("");
          }}
        >
          <option value="">{idArea ? "Elige un tipo" : "Primero elige un área"}</option>
          {tipos.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        {error && <p id="idTipoReq-error" className={fieldError}>Elige el tipo y las categorías del requerimiento.</p>}
      </div>

      {tipo && askCategoria1 && (
        <div>
          <label htmlFor="categoria1" className={fieldLabel}>Categoría</label>
          <select
            id="categoria1"
            className={fieldControl()}
            value={categoria1}
            onChange={(event) => {
              setCategoria1(event.target.value);
              setCategoria2("");
            }}
          >
            <option value="">Elige una categoría</option>
            {categorias1.map((value) => (
              <option key={key(value)} value={key(value)}>{value ?? "Sin categoría"}</option>
            ))}
          </select>
        </div>
      )}

      {tipo && askCategoria2 && (
        <div>
          <label htmlFor="categoria2" className={fieldLabel}>Subcategoría</label>
          <select id="categoria2" className={fieldControl()} value={categoria2} onChange={(event) => setCategoria2(event.target.value)}>
            <option value="">Elige una subcategoría</option>
            {categorias2.map((value) => (
              <option key={key(value)} value={key(value)}>{value ?? "Sin subcategoría"}</option>
            ))}
          </select>
        </div>
      )}

      <input type="hidden" name="idTipoReq" value={resolved?.idTipoReq ?? ""} />
    </>
  );
}

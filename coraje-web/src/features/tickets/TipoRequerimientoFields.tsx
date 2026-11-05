"use client";

import { useMemo, useState, type ReactNode } from "react";

import { AREA_TILE_CLASS } from "@/design-system/patterns/area/area";
import { fieldControl, fieldError, fieldLabel } from "@/design-system/recipes/field";
import { colorTransition } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";
import { areaDisplayName, areaShortCode, areaThemeKey } from "@/features/areas/area-theme";
import type { CreationCatalog } from "@/server/tickets/ticket-queries";

import { formatCatalogLabel } from "./format";

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

/**
 * Áreas como chips (U31 las puso en tarjetas; U33 las compacta, porque en
 * móvil las tarjetas apiladas ocupaban unos 390 px): un botón de opción real
 * por área, oculto, dentro de un chip con el recuadro de color y el código del
 * área. Con radios nativos, las flechas recorren las áreas y el lector de
 * pantalla anuncia el grupo y la elegida. El chip elegido cambia de borde y de
 * fondo, no solo de color; el foco con teclado se ve en el chip.
 *
 * Sin texto de ayuda: el encabezado de la ventana ya dice «Llegará a …» al
 * elegir.
 */
function AreaChips({
  areas,
  value,
  onChange,
}: {
  areas: Catalog["areas"];
  value: string;
  onChange: (idArea: string) => void;
}) {
  return (
    <fieldset>
      <legend className={fieldLabel}>Área que atiende</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {areas.map((area) => (
          <label
            key={area.idArea}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-pill border-2 border-line bg-surface py-1 pr-3.5 pl-1 hover:border-line-strong",
              // La elegida toma el acento, que en la ventana ya es el de esa área.
              "has-checked:border-accent has-checked:bg-accent-surface",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid has-focus-visible:outline-focus",
              colorTransition,
            )}
          >
            <input
              type="radio"
              // No viaja como dato: lo que se envía es el tipo resuelto.
              name="areaElegida"
              value={area.idArea}
              checked={value === area.idArea}
              onChange={() => onChange(area.idArea)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-pill text-2xs font-bold tracking-wide text-heading",
                AREA_TILE_CLASS[areaThemeKey(area.nombre)],
              )}
            >
              {areaShortCode(area.nombre)}
            </span>
            <span className="min-w-0 text-sm font-bold text-heading">{areaDisplayName(area.nombre)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TipoRequerimientoFields({
  catalog,
  initialIdTipoReq,
  error,
  areaPicker = "select",
  onAreaChange,
}: {
  catalog: Catalog;
  /** Tipo enviado en un intento fallido, para reconstruir la selección. */
  initialIdTipoReq?: string;
  error?: string;
  /** `chips`: las áreas como chips (U33, crear); `select`: el desplegable (redirigir). */
  areaPicker?: "select" | "chips";
  /** Avisa del área elegida, por nombre, para que el formulario se tiña con su color. */
  onAreaChange?: (nombreArea: string | null) => void;
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

  const chooseArea = (value: string) => {
    setIdArea(value);
    setTipo("");
    setCategoria1("");
    setCategoria2("");
    onAreaChange?.(catalog.areas.find((area) => area.idArea === value)?.nombre ?? null);
  };

  const areaField: ReactNode =
    areaPicker === "chips" ? (
      <AreaChips areas={catalog.areas} value={idArea} onChange={chooseArea} />
    ) : (
      <div>
        <label htmlFor="area" className={fieldLabel}>Área que atiende</label>
        <select id="area" className={fieldControl()} value={idArea} onChange={(event) => chooseArea(event.target.value)}>
          <option value="">Elige un área</option>
          {catalog.areas.map((area) => (
            <option key={area.idArea} value={area.idArea}>{area.nombre}</option>
          ))}
        </select>
      </div>
    );

  const cascade: ReactNode = (
    <>
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
            <option key={value} value={value}>{formatCatalogLabel(value)}</option>
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
              <option key={key(value)} value={key(value)}>{value ? formatCatalogLabel(value) : "Sin categoría"}</option>
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
              <option key={key(value)} value={key(value)}>{value ? formatCatalogLabel(value) : "Sin subcategoría"}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  return (
    <>
      {areaField}
      {/* Con chips, la cascada va en una fila: las tres preguntas son una
          sola decisión, «de qué se trata», y así se leen. */}
      {areaPicker === "chips" ? <div className="grid gap-4 sm:grid-cols-3">{cascade}</div> : cascade}
      <input type="hidden" name="idTipoReq" value={resolved?.idTipoReq ?? ""} />
    </>
  );
}

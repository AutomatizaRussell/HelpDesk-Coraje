"use client";

import { CircleAlert, CircleCheck, Paperclip, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

import { IconButton } from "@/design-system/components/IconButton";
import { iconStroke } from "@/design-system/foundations/iconography";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldError, fieldLabel } from "@/design-system/recipes/field";
import { colorTransition, focusRing } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";
import {
  ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENTS_PER_SUBMIT,
  MAX_ATTACHMENT_BYTES,
  attachmentProblem,
  formatBytes,
} from "@/server/attachments/attachment-rules";

import { prepareAttachmentUploadAction } from "./attachment-actions";
import { UploadError, uploadInFragments } from "./fragmented-upload";

/**
 * Selector de adjuntos de un formulario del ticket (specs/tickets.md §14.2).
 *
 * Cada archivo se sube en cuanto se elige, directo a OneDrive, mientras la
 * persona termina de escribir. Al enviar el formulario solo viaja, en el campo
 * oculto `adjuntos`, la lista de lo que terminó de subir; el servidor la
 * confirma contra Graph antes de guardar nada. Mientras haya una subida en
 * curso, el formulario no se puede enviar (`onBusyChange`): enviarlo dejaría
 * fuera un archivo que la persona cree adjunto.
 *
 * Si el envío falla, la lista se conserva: los archivos ya están en OneDrive y
 * no hay que subirlos otra vez.
 */

/**
 * Recuadro con el tipo del archivo (U31): la extensión en mayúsculas sobre un
 * tono que agrupa familias —PDF, hojas de cálculo, documentos, presentaciones—
 * para que la lista se reconozca sin leer los nombres. Es apoyo visual: el
 * nombre completo va al lado.
 */
const TYPE_TONE: Record<string, string> = {
  pdf: "bg-danger-surface text-danger",
  xls: "bg-success-surface text-success",
  xlsx: "bg-success-surface text-success",
  csv: "bg-success-surface text-success",
  doc: "bg-info-surface text-heading",
  docx: "bg-info-surface text-heading",
  ppt: "bg-warning-surface text-warning",
  pptx: "bg-warning-surface text-warning",
};

function extensionOf(nombre: string): string {
  const dot = nombre.lastIndexOf(".");
  return dot > 0 ? nombre.slice(dot + 1).toLowerCase() : "";
}

type Item = {
  key: string;
  nombre: string;
  tamano: number;
  estado: "subiendo" | "listo" | "error";
  progreso: number;
  error?: string;
  subido?: { idCarga: string; nombre: string; tamano: number; idObjeto: string };
  cancelar?: AbortController;
};

/**
 * Un archivo en la forma compacta (U33): recuadro del tipo, nombre recortado,
 * y su estado —barra mientras sube, tamaño y marca al terminar, alerta si
 * falló— con la × para quitarlo o cancelar la subida.
 */
function AttachmentChip({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const extension = extensionOf(item.nombre);
  return (
    <li
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-pill border bg-surface py-0.5 pr-0.5 pl-1",
        item.estado === "error" ? "border-danger" : "border-line",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rounded-pill px-1.5 py-0.5 text-2xs font-bold uppercase",
          TYPE_TONE[extension] ?? "bg-surface-sunken text-ink-muted",
        )}
      >
        {extension.slice(0, 4) || "—"}
      </span>
      <span className="min-w-0 max-w-48 truncate text-sm text-ink" title={item.nombre}>{item.nombre}</span>
      {item.estado === "subiendo" && (
        // La barra de `hd-progress` ocupa todo el ancho de su contenedor.
        <span className="w-10 shrink-0">
          <progress className="hd-progress block" value={item.progreso} max={100} aria-label={`Subiendo ${item.nombre}`} />
        </span>
      )}
      {item.estado === "listo" && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm text-ink-muted">
          {formatBytes(item.tamano)}
          <CircleCheck aria-hidden className="size-4 text-success" strokeWidth={iconStroke.regular} />
          <span className="sr-only">listo</span>
        </span>
      )}
      {item.estado === "error" && (
        <>
          <CircleAlert aria-hidden className="size-4 shrink-0 text-danger" strokeWidth={iconStroke.regular} />
          <span className="sr-only">no se adjuntó</span>
        </>
      )}
      <IconButton
        label={item.estado === "subiendo" ? `Cancelar la subida de ${item.nombre}` : `Quitar ${item.nombre}`}
        icon={X}
        onClick={onRemove}
        className="size-7 rounded-pill"
      />
    </li>
  );
}

export function AttachmentPicker({
  name = "adjuntos",
  onBusyChange,
  error,
  layout = "zone",
  trailing,
}: {
  name?: string;
  onBusyChange: (busy: boolean) => void;
  /** Error que devolvió el servidor para este campo. */
  error?: string;
  /**
   * `zone` (U31): zona grande para elegir o soltar y una fila por archivo; la
   * usa el cuadro de escritura del detalle. `compact` (U33, «Nuevo ticket»):
   * un botón y los archivos en chips, para que el formulario no se alargue.
   */
  layout?: "zone" | "compact";
  /** Solo en `compact`: acciones que van en la misma fila que «Adjuntar archivos». */
  trailing?: ReactNode;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // Un archivo arrastrado está sobre la zona: se marca para que se vea dónde soltarlo.
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = items.some((item) => item.estado === "subiendo");

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  // Al desmontar (éxito del formulario, cierre del diálogo) se cortan las subidas en curso.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => item.cancelar?.abort()), []);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function upload(file: File, key: string, cancelar: AbortController) {
    const nombre = file.name.trim();
    try {
      const prepared = await prepareAttachmentUploadAction({ nombre, tamano: file.size });
      if (!prepared.ok) throw new UploadError(prepared.message);
      const idObjeto = await uploadInFragments({
        file,
        uploadUrl: prepared.session.uploadUrl,
        signal: cancelar.signal,
        onProgress: (progreso) => update(key, { progreso }),
      });
      update(key, {
        estado: "listo",
        progreso: 100,
        cancelar: undefined,
        subido: { idCarga: prepared.session.idCarga, nombre, tamano: file.size, idObjeto },
      });
    } catch (failure) {
      if (cancelar.signal.aborted) return;
      update(key, {
        estado: "error",
        cancelar: undefined,
        error: failure instanceof UploadError ? failure.message : `No se pudo subir ${nombre}.`,
      });
    }
  }

  function onChoose(files: FileList | null) {
    setAviso(null);
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS_PER_SUBMIT - items.length;
    const chosen = Array.from(files);
    if (chosen.length > room) {
      setAviso(`Puedes adjuntar hasta ${MAX_ATTACHMENTS_PER_SUBMIT} archivos por envío.`);
    }
    const nuevos: Item[] = [];
    for (const file of chosen.slice(0, Math.max(0, room))) {
      const problem = attachmentProblem({ name: file.name, size: file.size });
      const key = crypto.randomUUID();
      if (problem) {
        nuevos.push({ key, nombre: file.name, tamano: file.size, estado: "error", progreso: 0, error: problem });
        continue;
      }
      const cancelar = new AbortController();
      nuevos.push({ key, nombre: file.name, tamano: file.size, estado: "subiendo", progreso: 0, cancelar });
      void upload(file, key, cancelar);
    }
    setItems((current) => [...current, ...nuevos]);
    // Vaciar el control permite volver a elegir el mismo archivo tras quitarlo.
    if (input.current) input.current.value = "";
  }

  function remove(key: string) {
    setItems((current) => {
      current.find((item) => item.key === key)?.cancelar?.abort();
      return current.filter((item) => item.key !== key);
    });
    setAviso(null);
  }

  const listos = items.flatMap((item) => (item.subido ? [item.subido] : []));
  const id = `campo-${name}`;
  const mensaje = error ?? aviso;
  const full = items.length >= MAX_ATTACHMENTS_PER_SUBMIT;

  // Soltar archivos sobre la zona hace lo mismo que elegirlos (U31). Sin
  // `preventDefault` en `dragover`, el navegador abriría el archivo en la
  // pestaña en lugar de dejarlo soltar.
  const onDragOver = (event: DragEvent) => {
    if (full) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!full) onChoose(event.dataTransfer.files);
  };

  // Lo que se envía y el selector nativo son iguales en las dos formas.
  const controls = (
    <>
      <input type="hidden" name={name} value={JSON.stringify(listos)} />
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onChoose(event.target.files)}
      />
    </>
  );

  if (layout === "compact") {
    const failed = items.filter((item) => item.estado === "error");
    return (
      // En la forma compacta se suelta en todo el bloque, no solo en el botón:
      // el botón es pequeño para apuntar con un archivo arrastrado.
      <div onDragOver={onDragOver} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        {controls}
        <div className="flex flex-wrap items-center gap-2">
          {!full && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-describedby={`${id}-hint`}
              className={cn(buttonRecipe({ variant: "secondary" }), dragging && "border-heading bg-accent-surface")}
            >
              <Paperclip aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
              Adjuntar archivos
            </button>
          )}
          {trailing}
          {!full && (
            <span id={`${id}-hint`} className="text-sm text-ink-muted">
              Hasta {MAX_ATTACHMENTS_PER_SUBMIT}, de {formatBytes(MAX_ATTACHMENT_BYTES)} cada uno
            </span>
          )}
        </div>
        <div aria-live="polite">
          {items.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2" aria-label="Archivos adjuntos">
              {items.map((item) => (
                <AttachmentChip key={item.key} item={item} onRemove={() => remove(item.key)} />
              ))}
            </ul>
          )}
          {/* El error de cada archivo va en texto, no solo en el borde rojo del chip. */}
          {failed.map((item) => (
            <p key={item.key} className={fieldError}>
              {item.error?.includes(item.nombre) ? item.error : `${item.nombre}: ${item.error}`}
            </p>
          ))}
        </div>
        {mensaje && <p className={fieldError}>{mensaje}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className={fieldLabel} id={`${id}-label`}>Adjuntos (opcional)</p>
      {controls}
      {!full && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-describedby={`${id}-hint`}
          className={cn(
            "mt-2 flex w-full items-center gap-3.5 rounded-card border-2 border-dashed p-4 text-left",
            dragging ? "border-heading bg-accent-surface" : "border-line-strong bg-surface-sunken hover:border-heading",
            colorTransition,
            focusRing,
          )}
        >
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-surface text-heading">
            <Upload className="size-5" strokeWidth={iconStroke.regular} />
          </span>
          <span className="min-w-0">
            <span className="block text-base text-ink">
              <strong className="font-bold text-heading">Elige archivos</strong> o arrástralos aquí
            </span>
            <span id={`${id}-hint`} className="block text-sm text-ink-muted">
              Hasta {MAX_ATTACHMENTS_PER_SUBMIT} archivos de {formatBytes(MAX_ATTACHMENT_BYTES)}: PDF, imágenes, Word, Excel, PowerPoint,
              CSV o ZIP.
            </span>
          </span>
        </button>
      )}
      {items.length > 0 && (
        <ul className="mt-2.5 space-y-2" aria-live="polite">
          {items.map((item) => {
            const extension = extensionOf(item.nombre);
            return (
              <li key={item.key} className="flex items-center gap-3 rounded-control border border-line px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-control text-2xs font-black uppercase",
                    TYPE_TONE[extension] ?? "bg-surface-sunken text-ink-muted",
                  )}
                >
                  {extension.slice(0, 4) || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{item.nombre}</p>
                  {item.estado === "subiendo" && (
                    <progress className="hd-progress mt-1.5 block" value={item.progreso} max={100} aria-label={`Subiendo ${item.nombre}`} />
                  )}
                  {item.estado === "error" && <p className="text-sm text-danger">{item.error}</p>}
                </div>
                <span className={cn("shrink-0 text-sm font-bold", item.estado === "listo" ? "text-success" : "text-ink-muted")}>
                  {item.estado === "subiendo" && `${item.progreso} %`}
                  {item.estado === "listo" && `${formatBytes(item.tamano)} · listo`}
                </span>
                <IconButton
                  label={item.estado === "subiendo" ? `Cancelar la subida de ${item.nombre}` : `Quitar ${item.nombre}`}
                  icon={X}
                  onClick={() => remove(item.key)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {mensaje && <p className={fieldError}>{mensaje}</p>}
    </div>
  );
}

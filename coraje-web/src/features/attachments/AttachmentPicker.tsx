"use client";

import { Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/design-system/components/IconButton";
import { iconStroke } from "@/design-system/foundations/iconography";
import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldError, fieldHint, fieldLabel } from "@/design-system/recipes/field";
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

export function AttachmentPicker({
  name = "adjuntos",
  onBusyChange,
  error,
}: {
  name?: string;
  onBusyChange: (busy: boolean) => void;
  /** Error que devolvió el servidor para este campo. */
  error?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
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

  return (
    <div>
      <p className={fieldLabel} id={`${id}-label`}>Adjuntos (opcional)</p>
      <p className={fieldHint} id={`${id}-hint`}>
        Hasta {MAX_ATTACHMENTS_PER_SUBMIT} archivos de {formatBytes(MAX_ATTACHMENT_BYTES)} cada uno: PDF, imágenes, Word, Excel,
        PowerPoint, CSV o ZIP.
      </p>
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
      {items.length < MAX_ATTACHMENTS_PER_SUBMIT && (
        <button
          type="button"
          className={cn(buttonRecipe({ variant: "secondary", size: "sm" }), "mt-2 gap-1.5")}
          aria-describedby={`${id}-hint`}
          onClick={() => input.current?.click()}
        >
          <Paperclip aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Adjuntar archivos
        </button>
      )}
      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-control border border-line" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{item.nombre}</p>
                <p className={cn("text-sm", item.estado === "error" ? "text-danger" : "text-ink-muted")}>
                  {item.estado === "subiendo" && `Subiendo… ${item.progreso} %`}
                  {item.estado === "listo" && `${formatBytes(item.tamano)} · listo`}
                  {item.estado === "error" && item.error}
                </p>
              </div>
              <IconButton
                label={item.estado === "subiendo" ? `Cancelar la subida de ${item.nombre}` : `Quitar ${item.nombre}`}
                icon={X}
                onClick={() => remove(item.key)}
              />
            </li>
          ))}
        </ul>
      )}
      {mensaje && <p className={fieldError}>{mensaje}</p>}
    </div>
  );
}

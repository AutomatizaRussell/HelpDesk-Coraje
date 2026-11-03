"use client";

import { Download, Paperclip } from "lucide-react";
import { useState } from "react";

import { iconStroke } from "@/design-system/foundations/iconography";
import { FormDialog } from "@/design-system/patterns/form-dialog/FormDialog";
import { buttonRecipe } from "@/design-system/recipes/button";
import { focusRing } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";
import { formatBytes, isPreviewable } from "@/server/attachments/attachment-rules";
import { APP_BASE_PATH } from "@/server/auth/base-path";

/**
 * Un adjunto en la historia del ticket (U29, decisión del usuario del
 * 03-nov-2026: «que todo se me abra dentro de la app; todo lo que se pueda
 * abrir»).
 *
 * - PDF, imágenes y Office se abren en una ventana de HelpDesk con el visor de
 *   OneDrive en un iframe (la ruta `vista` redirige a él). La ventana ofrece
 *   también descargarlo.
 * - CSV y ZIP no tienen vista previa útil: se descargan directamente.
 *
 * Las rutas son de API y llevan el basePath a mano: no son páginas, y `<Link>`
 * intentaría precargarlas.
 */
export function AttachmentLink({ idTicket, id, nombre, tamanoBytes }: { idTicket: string; id: string; nombre: string; tamanoBytes: number }) {
  const [open, setOpen] = useState(false);
  const base = `${APP_BASE_PATH}/api/tickets/${idTicket}/adjuntos/${id}`;
  const label = (
    <>
      <Paperclip aria-hidden className="size-3.5" strokeWidth={iconStroke.regular} />
      {nombre}
      <span className="font-normal text-ink-muted">· {formatBytes(tamanoBytes)}</span>
    </>
  );
  const linkClass = cn("inline-flex items-center gap-1.5 rounded-control text-left text-sm font-bold text-heading hover:underline", focusRing);

  if (!isPreviewable(nombre)) {
    return (
      <a href={base} className={linkClass}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        {label}
      </button>
      <FormDialog open={open} title={nombre} onClose={() => setOpen(false)} size="wide">
        <div className="space-y-3 p-5 lg:p-6">
          {/* Sin `sandbox`: el visor de Office necesita sus scripts. Es otro origen, así que no ve nada de HelpDesk. */}
          <iframe src={`${base}/vista`} title={`Vista previa de ${nombre}`} className="h-preview w-full rounded-control border border-line bg-surface-sunken" />
          <a href={base} className={cn(buttonRecipe({ variant: "secondary", size: "sm" }), "gap-1.5")}>
            <Download aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
            Descargar
          </a>
        </div>
      </FormDialog>
    </>
  );
}

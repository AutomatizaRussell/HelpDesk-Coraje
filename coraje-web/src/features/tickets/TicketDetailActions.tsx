"use client";

import { X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { IconButton } from "@/design-system/components/IconButton";
import { FormDialog } from "@/design-system/patterns/form-dialog/FormDialog";
import { buttonRecipe } from "@/design-system/recipes/button";

import { RejectForm } from "./TicketActionForms";

/**
 * Acciones del detalle que viven junto a su dato (opción B, 30-sep-2026):
 * el lápiz de «Responsable», el + de «Observadores». El icono va en la línea
 * del rótulo y el formulario se abre debajo del dato, en el mismo sitio, sin
 * tapar la historia.
 *
 * Mismo marcado que `Field` del detalle (`dt`/`dd` dentro del `dl`), para que
 * un campo editable y uno de solo lectura se lean igual.
 *
 * Tras una acción con éxito, el servidor vuelve a dibujar la ficha: si la
 * persona ya no puede repetirla (por ejemplo, reasignó y dejó de ser la
 * responsable), el icono desaparece solo.
 */
export function EditableField({
  label,
  actionLabel,
  icon,
  form,
  children,
}: {
  label: string;
  /** Qué hace el icono, para lector de pantalla y al pasar el ratón. */
  actionLabel: string;
  icon: LucideIcon;
  form: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-2.5">
      <dt className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        <span>{label}</span>
        <IconButton
          label={open ? "Cancelar" : actionLabel}
          icon={open ? X : icon}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        />
      </dt>
      <dd className="mt-0.5 text-base text-ink">
        {children}
        {open && <div className="mt-2 space-y-3 rounded-control border border-line bg-surface-sunken p-3">{form}</div>}
      </dd>
    </div>
  );
}

/**
 * «Rechazar» junto al estado del ticket, que es lo que cambia. Es lo único
 * del detalle que interrumpe: no se deshace, así que se confirma en una
 * ventana que pide el motivo. Lejos de «Responder y cerrar», para que no se
 * confundan.
 */
export function RejectAction({ idTicket }: { idTicket: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonRecipe({ variant: "danger", size: "sm" })}>
        Rechazar
      </button>
      <FormDialog
        open={open}
        title="Rechazar ticket"
        onClose={() => setOpen(false)}
        discardQuestion="¿Descartar el motivo del rechazo?"
      >
        <div className="p-5 lg:p-6">
          <RejectForm idTicket={idTicket} />
        </div>
      </FormDialog>
    </>
  );
}

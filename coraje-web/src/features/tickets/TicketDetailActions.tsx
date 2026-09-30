"use client";

import { useState, type ReactNode } from "react";

import { FormDialog } from "@/design-system/patterns/form-dialog/FormDialog";
import { buttonRecipe } from "@/design-system/recipes/button";

import { RejectForm } from "./TicketActionForms";

/**
 * Acciones del detalle que viven junto a su dato (decisión del usuario del
 * 30-sep-2026, opción B): cambiar el responsable junto al responsable, añadir
 * observadores junto a los observadores. Se abren en el mismo sitio, sin
 * tapar la historia.
 *
 * Tras una acción con éxito, el servidor vuelve a dibujar la ficha: si la
 * persona ya no puede repetirla (por ejemplo, reasignó y dejó de ser la
 * responsable), el control desaparece solo.
 */
export function InlineAction({
  label,
  accessibleLabel,
  children,
}: {
  /** Texto corto del botón: «Cambiar», «Añadir», «Pedir». */
  label: string;
  /** Qué hace, para lector de pantalla: «Cambiar responsable». */
  accessibleLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={accessibleLabel}
        aria-expanded={false}
        className={buttonRecipe({ variant: "secondary", size: "sm" })}
      >
        {label}
      </button>
    );
  }

  return (
    // `w-full`: abierto ocupa su propia fila bajo el dato, aunque el botón
    // cerrado compartiera fila con él.
    <div className="mt-2 w-full space-y-3 rounded-control border border-line bg-surface-sunken p-3">
      {children}
      <button type="button" onClick={() => setOpen(false)} aria-expanded className={buttonRecipe({ variant: "secondary", size: "sm" })}>
        Cancelar
      </button>
    </div>
  );
}

/**
 * «Rechazar» es lo único del ticket que interrumpe: no se deshace, así que se
 * confirma en una ventana que pide el motivo. Destructiva y separada del
 * resto; nunca recibe el foco inicial de la vista.
 */
export function RejectAction({ idTicket }: { idTicket: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonRecipe({ variant: "danger", size: "sm", fullWidth: true })}>
        Rechazar ticket
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

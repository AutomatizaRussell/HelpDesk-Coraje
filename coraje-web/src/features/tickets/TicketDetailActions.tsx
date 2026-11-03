"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { IconButton } from "@/design-system/components/IconButton";

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
 *
 * El icono llega por nombre y no como componente: este es un componente de
 * cliente y la página que lo usa es de servidor, y un componente (una función)
 * no se puede serializar de uno a otro. Pasar `icon={Pencil}` rompía el detalle
 * entero con «Functions cannot be passed directly to Client Components».
 */

/** Los iconos que puede llevar un campo editable, por nombre. */
const FIELD_ICONS = { editar: Pencil, anadir: Plus } as const;

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
  icon: keyof typeof FIELD_ICONS;
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
          icon={open ? X : FIELD_ICONS[icon]}
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

"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { FormDialog } from "@/design-system/patterns/form-dialog/FormDialog";

/**
 * «Nuevo ticket» abierto encima de la bandeja (decisión del usuario del
 * 30-sep-2026). Es la ruta interceptada `app/tickets/@modal/(.)nuevo`, y es
 * la única forma de radicar: abrir o recargar `/tickets/nuevo` directamente
 * lleva a la bandeja (04-nov-2026). Tener URL propia hace que el botón atrás
 * cierre la ventana.
 */

const DIALOG_PATH = "/tickets/nuevo";

export function NewTicketDialog({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <FormDialog
      // El slot conserva esta página al navegar a otra URL de /tickets (por
      // ejemplo, al detalle del ticket recién creado). Fuera de su URL, la
      // ventana no existe.
      open={pathname === DIALOG_PATH}
      title="Nuevo ticket"
      onClose={() => router.back()}
      discardQuestion="¿Descartar el ticket? Se perderá lo que escribiste."
    >
      {children}
    </FormDialog>
  );
}

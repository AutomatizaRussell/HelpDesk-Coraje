"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { FormDialog } from "@/design-system/patterns/form-dialog/FormDialog";

/**
 * «Nuevo ticket» abierto encima de la bandeja (decisión del usuario del
 * 30-sep-2026). Es la ruta interceptada `app/tickets/@modal/(.)nuevo`: desde
 * la bandeja se abre aquí; abrir o recargar `/tickets/nuevo` directamente
 * sigue mostrando la página completa. Así la URL se puede compartir y el
 * botón atrás cierra la ventana, que eran los dos riesgos de una ventana
 * emergente para un formulario largo.
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

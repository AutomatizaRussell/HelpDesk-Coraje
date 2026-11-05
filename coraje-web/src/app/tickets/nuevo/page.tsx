import { redirect } from "next/navigation";

import { requireCurrentEmployee } from "@/server/auth/current-employee";

/**
 * `/tickets/nuevo` abierta o recargada directamente: lleva a la bandeja.
 *
 * Radicar un ticket existe solo como ventana emergente sobre la bandeja
 * (`app/tickets/@modal/(.)nuevo`), que Next dibuja únicamente en una
 * navegación dentro de la aplicación. Una carga directa —recargar con la
 * ventana abierta, pegar la URL— no la intercepta y cae en esta página.
 * Antes dibujaba el formulario a página completa, y recargar dejaba a la
 * persona en una vista distinta de la que tenía; por decisión del usuario del
 * 04-nov-2026, ya no existe esa versión. Recargar con algo escrito lo
 * advierte el navegador antes (`FormDialog`, `beforeunload`).
 *
 * El archivo tiene que existir: sin la ruta real, Next no tiene qué
 * interceptar. Resuelve la sesión antes de redirigir aunque `/tickets` la
 * vuelva a exigir: toda ruta privada la resuelve en su propio archivo
 * (`perimeter.test.mts`), y sin sesión lleva al ingreso, no a la bandeja.
 */
export default async function NewTicketPage(): Promise<never> {
  await requireCurrentEmployee("/tickets/nuevo");
  redirect("/tickets");
}

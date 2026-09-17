import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/server/auth/current-employee";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";

/**
 * Server Action en vez de `<form action="/api/auth/logout">`: un action
 * literal no antepone el basePath de HelpDesk (D7) como sí lo hacen
 * `redirect()` y las Server Actions — evita construir esa URL a mano.
 */
async function logoutAction() {
  "use server";
  await revokeCurrentEmployeeSession("LOGOUT");
  redirect("/login");
}

/**
 * Entrada raíz de HelpDesk para empleados (specs/acceso-empleados.md §4).
 *
 * Sin sesión: dispara el intento silencioso de inmediato (`prompt=none`) —
 * el caso ordinario es "ningún clic" cuando el navegador ya trae una sesión
 * viva de Microsoft Entra ID por cualquier otro medio (Conecta, Outlook,
 * Teams). Con sesión: entra.
 *
 * El selector portal/redirección que vivía aquí se retira — la
 * autorización destructiva de CLAUDE.md cubre esta vista. `/portal` y
 * `/redireccion` no se tocan, solo pierden su punto de entrada visual desde
 * la raíz (U4 decide su destino final).
 *
 * Sin estilo propio, mismo motivo que /login: el contrato de diseño de
 * HelpDesk es competencia de U5, no de esta unidad.
 */
export default async function HomePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect("/api/auth/microsoft/start?destino=%2F");
  }

  return (
    <main>
      <h1>HelpDesk</h1>
      <p>Sesión activa: {employee.nombreCompleto}.</p>
      <form action={logoutAction}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
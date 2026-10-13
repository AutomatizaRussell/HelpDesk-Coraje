import { isPortalPath } from "@/server/security/public-paths";

/**
 * Conexión del portal de clientes (U20, decisión del usuario del 13-oct-2026).
 *
 * El portal (U8), su consola de accesos y la redirección de los tickets que
 * llegan por él (`REDIRECTOR`, `ticket.redirigir`) quedan **desconectados, no
 * borrados**: el código, las tablas, los contactos y el rol siguen ahí, por si
 * hay que volver a conectarlos. PowerApps nunca tuvo portal: allí los tickets
 * de cliente los radica un empleado, y eso es lo que sigue vivo en el modo
 * Externo.
 *
 * Se conecta con `PORTAL_CLIENTES_CONECTADO=true` y un redespliegue. Sin la
 * variable, o con cualquier otro valor, está desconectado: el estado seguro es
 * el que no expone nada a clientes.
 */

const CONNECTED_VARIABLE = "PORTAL_CLIENTES_CONECTADO";

export function isClientPortalConnected(): boolean {
  return process.env[CONNECTED_VARIABLE]?.trim() === "true";
}

/**
 * Rutas que solo existen con el portal conectado: el portal mismo, la consola
 * de accesos de clientes y la redirección de sus tickets. Con el portal
 * desconectado, el perímetro las responde 404, también a los envíos de
 * formulario: así ninguna acción de servidor de esas vistas es alcanzable,
 * sin tener que poner un guard en cada una.
 */
const EMPLOYEE_PORTAL_PREFIXES = ["/accesos", "/redirigir"] as const;

export function isClientPortalSurface(pathname: string): boolean {
  return (
    isPortalPath(pathname) ||
    EMPLOYEE_PORTAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

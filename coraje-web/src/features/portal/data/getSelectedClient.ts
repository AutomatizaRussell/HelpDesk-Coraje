import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const CLIENT_COOKIE_NAME = "coraje_cliente_id";

/**
 * Lee el cliente seleccionado desde cookie.
 *
 * Esto es login falso. Sirve para prototipo funcional, no para seguridad.
 * Más adelante debe reemplazarse por autenticación real.
 */
export async function getSelectedClient() {
  const cookieStore = await cookies();
  const clientId = cookieStore.get(CLIENT_COOKIE_NAME)?.value;

  if (!clientId) {
    return null;
  }

  return prisma.dimClienteContai.findUnique({
    where: {
      idClienteContai: clientId,
    },
    select: {
      idClienteContai: true,
      nombreCliente: true,
      identificacionFiscal: true,
      tipoCliente: true,
      grupoEconomico: true,
      estadoCliente: true,
    },
  });
}

export { CLIENT_COOKIE_NAME };

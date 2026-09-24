import { EntryHandoff } from "@/features/ingreso/EntryHandoff";
import { sanitizeDestination } from "@/server/auth/sanitize-destination";

/**
 * Puerta de entrada sin sesión (specs/integracion-conecta.md §2). El perímetro
 * manda aquí toda navegación de documento que llega sin sesión: esta página
 * decide en el navegador si la persona viene con sesión de Conecta —ingreso
 * sin clics, dentro del shell de Conecta— o directo —pantalla de ingreso con
 * selector de cuenta—.
 *
 * Pública por necesidad (`public-paths.ts`): quien llega aquí no tiene sesión.
 * No muestra ni recibe dato alguno del servidor; el destino se sanea aquí y
 * otra vez en el servidor que lo consume.
 */
export default async function IngresoPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;
  return <EntryHandoff destino={sanitizeDestination(destino)} />;
}

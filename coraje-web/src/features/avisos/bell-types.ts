/**
 * Lo que devuelve `GET /api/avisos` para el panel de la campana (U15). Vive
 * aparte de la ruta para que el componente de cliente no importe nada de
 * `app/api`. Las fechas llegan ya formateadas: el servidor decide la zona
 * horaria, no el navegador.
 */
export type BellNoticesResponse = {
  /** Lo que cuenta la campana: pendientes abiertos más novedades sin leer. */
  total: number;
  atencion: number;
  items: { id: string; titulo: string; detalle: string; fecha: string; leido: boolean; atencion: boolean }[];
};

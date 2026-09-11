/**
 * Representa una fila operativa del listado de tickets.
 *
 * Este tipo NO replica el modelo físico completo de Prisma. Es un DTO
 * específico para la pantalla de listado. Eso evita acoplar la tabla visual
 * a todos los detalles internos de PostgreSQL y permite evolucionar la UI
 * sin arrastrar toda la estructura de base de datos.
 */
export type TicketListItem = {
  /**
   * Identificador técnico interno del ticket.
   * Se usa como key estable en React y para futura navegación a /tickets/[id].
   */
  idTicket: string;

  /**
   * Código visible generado por PostgreSQL.
   * Reemplaza el uso legacy de consecutivo_sp / Id_Req.
   *
   * Nullable: el trigger de base de datos no lo genera hasta que el ticket
   * tiene área destino — un ticket recién creado desde el portal todavía no
   * la tiene.
   */
  codigoTicket: string | null;

  /**
   * Descripción principal del requerimiento.
   * En el modelo canónico reemplaza el antiguo titulo_ticket.
   */
  descripcion: string;

  cliente: string;
  area: string;
  estado: string;
  prioridad: string;

  /**
   * Tipo funcional del requerimiento, si el mapeo legacy logró resolverlo.
   */
  tipoRequerimiento: string;

  /**
   * Categorías normalizadas desde TipoReqHD / HelpDeskBd.
   */
  categoria1: string;
  categoria2: string;

  fechaCreacion: Date;
  fechaLimite: Date | null;
  fechaResolucion: Date | null;

  /**
   * Origen funcional del ticket.
   * Ejemplo: SHAREPOINT_LEGACY, PORTAL_CLIENTE, SISTEMA_INTERNO.
   */
  origenSistema: string;
};
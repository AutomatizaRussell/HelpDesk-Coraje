/**
 * Códigos de las acciones del catálogo (specs/permisos.md §3), tal como están
 * sembrados en `app.permiso_accion` por la migración
 * `20260926100000_permisos_y_creacion_ticket`.
 *
 * Este archivo **no** decide quién puede qué: eso vive en `app.permiso_regla`,
 * que es la única fuente operativa (permisos.md §1). Aquí solo se nombran los
 * códigos para que el compilador impida pedir un permiso mal escrito. Una
 * prueba (`catalog.test.mts`) exige que cada código de esta lista esté
 * sembrado en alguna migración y que la aplicación consulte cada uno en algún
 * sitio: un permiso en el catálogo que nadie consulta no es autorización
 * aplicada (permisos.md §7).
 */
export const TICKET_ACTIONS = {
  consultar: "ticket.consultar",
  crear: "ticket.crear",
  reasignar: "ticket.reasignar",
  responder: "ticket.responder",
  rechazar: "ticket.rechazar",
  notaInterna: "ticket.nota_interna",
  reenviarNotificacion: "ticket.notificacion.reenviar",
} as const;

export type TicketAction = (typeof TICKET_ACTIONS)[keyof typeof TICKET_ACTIONS];

/**
 * Códigos de las acciones del catálogo (specs/permisos.md §3), tal como están
 * sembrados en `app.permiso_accion` por las migraciones
 * `20260926100000_permisos_y_creacion_ticket`,
 * `20260928110000_acceso_clientes`, `20260928130000_observabilidad`,
 * `20260928150000_seguimiento_ticket` y `20260930120000_avisos_ticket`.
 *
 * Este archivo **no** decide quién puede qué: eso vive en `app.permiso_regla`,
 * que es la única fuente operativa (permisos.md §1). Aquí solo se nombran los
 * códigos para que el compilador impida pedir un permiso mal escrito. Una
 * prueba (`catalog.test.mts`) exige que cada código de estas listas esté
 * sembrado en alguna migración y que la aplicación consulte cada uno en algún
 * sitio: un permiso en el catálogo que nadie consulta no es autorización
 * aplicada (permisos.md §7).
 */
export const TICKET_ACTIONS = {
  consultar: "ticket.consultar",
  crear: "ticket.crear",
  /** T3: redirigir al área un ticket del portal. Solo `TOTAL` lo cubre (scope.ts). */
  redirigir: "ticket.redirigir",
  reasignar: "ticket.reasignar",
  responder: "ticket.responder",
  rechazar: "ticket.rechazar",
  notaInterna: "ticket.nota_interna",
  reenviarNotificacion: "ticket.notificacion.reenviar",
  /**
   * U11 (tickets.md §11): añadir o retirar observadores. Un observador ve el
   * ticket y recibe avisos; no gana ninguna otra acción (scope.ts).
   */
  gestionarObservadores: "ticket.observador.gestionar",
  /** U11: pedir a una persona que confirme algo. No bloquea el ticket. */
  solicitarValidacion: "ticket.validacion.solicitar",
  /**
   * U11: escribir en un ticket propio abierto sin cerrarlo. Para esta acción,
   * «propio» es haberlo radicado, no ser su responsable (scope.ts).
   */
  comentarSolicitante: "ticket.solicitante.comentar",
} as const;

/**
 * Acciones que no se evalúan sobre un ticket. Viven aparte para que
 * `requireTicketAction` no pueda recibirlas por error: su alcance no significa
 * «qué tickets», y `scope.ts` no sabría qué hacer con ellas.
 */
export const PORTAL_ACTIONS = {
  /** Alta de contactos de cliente, invitaciones y revocación (U8). */
  administrarAccesos: "portal.acceso.administrar",
} as const;

/**
 * Salud de la aplicación (U10, migración `20260928130000_observabilidad`).
 * Tampoco se evalúan sobre un ticket: su alcance `TOTAL` significa «toda la
 * aplicación». Son dos porque mirar no es lo mismo que dar algo por atendido.
 */
export const SALUD_ACTIONS = {
  /** Ver la vista `/salud`: la revisión viva y la última diaria. */
  consultar: "salud.consultar",
  /** Marcar revisada, con motivo, una divergencia rechazada con PowerApps (S4). */
  revisarDivergencia: "salud.divergencia.revisar",
} as const;

/**
 * Avisos del centro de notificaciones (U15, migración
 * `20260930120000_avisos_ticket`). Alcance `PROPIO`: cada persona ve sus
 * avisos y ningún otro; las consultas filtran siempre por destinatario.
 */
export const AVISO_ACTIONS = {
  /** Ver la campana y la página de avisos, y marcarlos como leídos. */
  consultar: "aviso.consultar",
} as const;

export type TicketAction = (typeof TICKET_ACTIONS)[keyof typeof TICKET_ACTIONS];

export type PortalAction = (typeof PORTAL_ACTIONS)[keyof typeof PORTAL_ACTIONS];

export type SaludAction = (typeof SALUD_ACTIONS)[keyof typeof SALUD_ACTIONS];

export type AvisoAction = (typeof AVISO_ACTIONS)[keyof typeof AVISO_ACTIONS];

/** Cualquier acción del catálogo, sea sobre un ticket o no. */
export type PermissionAction = TicketAction | PortalAction | SaludAction | AvisoAction;

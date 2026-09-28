-- =====================================================================
-- U11 · Valores nuevos del tipo de evento (solo ADD VALUE)
-- (docs/specs/tickets.md §11; docs/specs/permisos.md §4.4 y §10)
-- =====================================================================
-- Va sola en su propio archivo por la precaución de tickets.md §6: Prisma
-- envuelve cada migración en una transacción, y un valor añadido con
-- ALTER TYPE ... ADD VALUE no se puede usar dentro de la transacción que lo
-- crea. La migración siguiente (20260928150000_seguimiento_ticket) les da
-- su rama en el escritor único y ya los usa.
--
-- Solo añade valores: ninguna fila existente cambia y ninguna consulta
-- actual se rompe.
-- =====================================================================

-- Observadores (tickets.md §11): quién añadió a quién, y quién lo retiró.
-- Son dos tipos y no uno con el sentido en el texto: la historia se lee por
-- tipo, y «añadido» y «retirado» no se confunden por un matiz de redacción.
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'OBSERVADOR_AGREGADO';
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'OBSERVADOR_RETIRADO';

-- Solicitud de validación (tickets.md §11): un paso ordinario, dirigido a
-- una persona, que no bloquea el ticket (decisión del 24-sep-2026).
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'SOLICITUD_VALIDACION';

-- Lo que escribe en su ticket el empleado que lo radicó, sin cerrarlo. No es
-- un COMENTARIO: ese tipo es la nota interna del equipo, y el solicitante no
-- la ve. Un tipo propio impide que una consulta que busca notas internas
-- arrastre lo que escribió el solicitante, o al revés.
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'COMENTARIO_SOLICITANTE';

-- =====================================================================
-- U34 · Valor nuevo del tipo de evento para la calificación (solo ADD VALUE)
-- (docs/specs/tickets.md §15)
-- =====================================================================
-- Va sola en su archivo por la misma razón que 20261103150000: Prisma
-- envuelve cada migración en una transacción, y un valor añadido con
-- ALTER TYPE ... ADD VALUE no se puede usar dentro de la transacción que lo
-- crea. La migración siguiente (20261104110000_calificacion_ticket) le da su
-- rama en el escritor único y su índice parcial.
-- =====================================================================

ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'CALIFICACION';

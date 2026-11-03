-- =====================================================================
-- U29 · Valores nuevos del tipo de evento para la aprobación (solo ADD VALUE)
-- (docs/specs/tickets.md §11.2)
-- =====================================================================
-- Va sola en su archivo por la misma razón que 20260928140000: Prisma
-- envuelve cada migración en una transacción, y un valor añadido con
-- ALTER TYPE ... ADD VALUE no se puede usar dentro de la transacción que lo
-- crea. La migración siguiente (20261103160000_aprobacion_ticket) les da su
-- rama en el escritor único.
--
-- La solicitud sigue siendo SOLICITUD_VALIDACION: desde el 03-nov-2026 pide
-- una aprobación que bloquea el cierre, pero el valor no se renombra porque
-- ya hay eventos con él y la historia se lee por tipo.
-- =====================================================================

ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'APROBACION_OTORGADA';
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'APROBACION_DENEGADA';
-- Quien pidió la aprobación la retira: pedírsela a la persona equivocada no
-- puede dejar el ticket bloqueado para siempre.
ALTER TYPE "helpdesk"."tipo_evento_ticket" ADD VALUE 'APROBACION_RETIRADA';

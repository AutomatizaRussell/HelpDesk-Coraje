-- =====================================================================
-- Rol REDIRECTOR (U17, docs/specs/permisos.md §2)
-- =====================================================================
-- Decisión del usuario del 01-oct-2026: CLASIFICADOR pasa a llamarse
-- REDIRECTOR. Quien lo tiene recibe los tickets que los clientes radican en
-- el portal y los redirige al área que los atiende; el nombre ahora dice lo
-- mismo que su permiso (ticket.redirigir) y que el evento que deja en la
-- historia (REDIRECCION).
--
-- RENAME VALUE conserva cada fila que lo usa (dim_personal, permiso_regla),
-- igual que AGENTE → COLABORADOR en 20260930100000_rol_colaborador: nadie
-- pierde acceso y ninguna regla cambia de dueño. Nada más cambia.
-- =====================================================================

ALTER TYPE "core"."rol_aplicacion" RENAME VALUE 'CLASIFICADOR' TO 'REDIRECTOR';

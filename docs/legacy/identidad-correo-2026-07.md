# `identidad_correo` — evidencia de una implementación olvidada (jul-2026)

**Qué es este documento:** evidencia empírica de un subsistema que existió en la base
real de producción entre julio y septiembre de 2026, nunca commiteado en este
repositorio, descubierto durante la investigación previa al baseline de Prisma (U2,
10-sep-2026), y retirado tras confirmar que no aportaba nada que `dim_personal` no
tuviera ya. Se preserva aquí lo único que sí costó trabajo humano reproducir, siguiendo
el mismo criterio que el resto de `legacy/`: es medición, no intención.

## 1. Qué existió y de dónde salió

El 14-jul-2026, en algún momento del hueco documental entre el prototipo inicial
(`02-jul-2026`, último commit de esa etapa) y el inicio del proceso documental actual
(`03-sep-2026`), alguien corrió directo contra la base de producción — sin dejar rastro
en `git`, en `n8n/` ni en ningún documento — una migración que construyó:

- `core.identidad_correo`: 237 correos clasificados como `PERSONAL` (158),
  `FUNCIONAL` (9) o `NO_CLASIFICADA` (70).
- `helpdesk.fact_ticket.id_identidad_correo_asignado` / `id_identidad_correo_solicitante`:
  columnas nuevas, resueltas contra `identidad_correo` para 2.542 y 2.559 tickets de
  los 2.825 existentes en ese momento.
- `helpdesk.fact_ticket.resolucion_asignado` / `resolucion_solicitante`: un rastro de
  auditoría por ticket (`SOURCE_PERSON_ID`, `LEGACY_INFERRED_PERSON`,
  `FUNCTIONAL_IDENTITY`, `UNRESOLVED`).
- `helpdesk.fact_ticket.correo_solicitante_snapshot` / `nombre_solicitante_snapshot` /
  `correo_asignado_snapshot` / `nombre_asignado_snapshot`: la misma resolución de
  `identidad_correo`, denormalizada como texto plano directamente en `fact_ticket`.
  Descubiertas después que el resto — solo aparecieron al pedir el listado *completo*
  de columnas de `fact_ticket` durante la verificación del primer retiro, no antes.
  Confirmado que son el mismo backfill: mismas cifras exactas de población
  (2.559 / 2.542, idénticas a las de las columnas `id_identidad_correo_*`) y el mismo
  patrón de placeholder (`MANUELAGUTIERREZ`, sin espacios, cuando no hubo nombre real).

Confirmado por timestamp: las 237 filas de `identidad_correo` comparten el mismo
`created_at` al milisegundo — una sola inserción masiva, no trabajo incremental.

**Hallazgo aparte, sin relación con lo anterior:** la misma revisión encontró
`helpdesk.fact_ticket.fecha_redireccion`, con **cero filas pobladas** en las 2.825
existentes. No es del sistema de identidad — pertenece a la función de redirección
interna (`coraje-web/src/app/redireccion/`), pero `redirectTicketAction` (la versión
committeada y activa hoy) no la lee ni la escribe. Nunca llegó a usarse. Se retira en
el mismo movimiento por ser la misma clase de ruido, no porque comparta origen.

## 2. Por qué se retira, no se retoma

Tres hechos, verificados contra la base real, no inferidos:

1. **`identidad_correo` es un derivado de `dim_personal`, no una fuente nueva.**
   `SELECT COUNT(*) FROM identidad_correo ic WHERE NOT EXISTS (... dim_personal ...)` da
   **cero**. Las 237 filas son, sin excepción, correos que ya existían en
   `dim_personal`.
2. **`LEGACY_INFERRED_PERSON` es el mismo problema que resuelve
   `sql/elt/04_transform_personal_historico.sql`.** El cruce contra
   `es_responsable_historico_no_identificado` (el marcador de F10,
   `docs/specs/tickets.md` §7.3) muestra que la inmensa mayoría de tickets
   `LEGACY_INFERRED_PERSON` resuelven a filas de `dim_personal` con
   `cargo = 'EX-EMPLEADO (RECUPERADO DEL HISTORIAL)'` — exactamente el patrón que ese
   script crea. No son dos mecanismos compitiendo: es el mismo mecanismo, julio lo
   etiquetó como categoría de auditoría y F10 lo estructuró como columna.
3. **El sistema de julio quedó abandonado, no solo desactualizado.** Ningún ticket
   ingresado después del 14-jul-2026 tiene resolución de identidad — los 283/266
   tickets sin resolver coinciden exactamente con los ingresados después de esa fecha.
   Nada en el pipeline actual (`sql/elt/`, `n8n/`) lo alimenta ni lo mantiene.

Efecto colateral real de esta investigación, ya corregido: el cruce reveló que el
backfill de F10 (`docs/estado/handoff.md`, corte 3) solo marcó **un** correo
(`recepcion.gct@rbcol.co`) de los varios que `04_transform_personal_historico.sql` ya
había creado con el mismo patrón. Se cerró con un `UPDATE` adicional (72 filas,
10-sep-2026) — ver handoff, corte 5.

**Retirado de la base real el 10-sep-2026, en dos pasadas** (la segunda solo apareció
al pedir el listado completo de columnas, no antes): `core.identidad_correo`,
`fact_ticket.id_identidad_correo_asignado`, `fact_ticket.id_identidad_correo_solicitante`,
`fact_ticket.resolucion_asignado`, `fact_ticket.resolucion_solicitante`,
`fact_ticket.correo_solicitante_snapshot`, `fact_ticket.nombre_solicitante_snapshot`,
`fact_ticket.correo_asignado_snapshot`, `fact_ticket.nombre_asignado_snapshot`,
`fact_ticket.fecha_redireccion`, sus índices y sus `CHECK`, y el
`chk_fact_ticket_origen_exclusivo` revertido a su forma simple committeada. Verificado
después: `fact_ticket` quedó con exactamente las 18 columnas que declara
`sql/db/06_helpdesk_facts.sql`, columna por columna.

## 3. Lo único que sí costó trabajo humano: los 9 buzones funcionales clasificados

A diferencia de `PERSONAL` (copiado de `dim_personal.nombre_completo`) y
`NO_CLASIFICADA` (placeholder automático: el correo sin arroba, en mayúsculas), estas
9 filas representan una decisión real de alguien sobre qué representa cada buzón
compartido. Se preservan tal cual, verbatim, contra la base real, 10-sep-2026:

| Correo | Nombre visible |
|---|---|
| `cartera.gct@rbcol.co` | Cartera GCT |
| `mercadeo.gct@rbcol.co` | Mercadeo GCT |
| `mercadeo.mde@rbcol.co` | Mercadeo Medellín |
| `recepcion.gct@rbcol.co` | Recepción GCT |
| `reclutamientoyseleccion@rbcol.co` | Reclutamiento y Selección |
| `soportegct@rbcol.co` | Soporte GCT |
| `talentohumano.gct@rbcol.co` | Talento Humano GCT |
| `tesoreria.gct@rbcol.co` | Tesorería GCT |
| `ti.gct@rbcol.co` | TI GCT |

Si en el futuro se necesita distinguir buzones funcionales de personales, esta lista es
el punto de partida — más barato que reconstruir el criterio desde cero.

## 4. Ideas rescatables, sin comprometer construcción

Ninguna de las tres es una unidad de trabajo. Son consideraciones para cuando alguien
retome identidad de tickets, para que no se pierdan una segunda vez.

1. **Rastro de auditoría de resolución.** Categorizar explícitamente cómo se resolvió
   `id_asignado`/`id_solicitante` de cada ticket (match directo vs. inferido vs.
   irresoluble) es una idea razonable — aplicada sobre el mecanismo de F10, que ya
   funciona, no sobre uno nuevo.
2. **`SOURCE_PERSON_ID` vs. resolución por correo.** Que julio distinguiera "vino con
   un ID de persona directo desde SharePoint" de "se infirió por texto de correo"
   sugiere que el payload crudo (`staging.sp_helpdesk_raw`) podría traer una referencia
   más confiable que `AsignadoA`/`Title` como texto libre. El ELT actual
   (`sql/elt/06_transform_ticket.sql`) no la usa. Sin investigar todavía.
3. **No mantener una tabla de clasificación de correos aparte.** Si vuelve a hacer
   falta, derivarla de `dim_personal.cargo` (más la tabla de la sección 3 como semilla)
   en vez de mantener una segunda fuente que puede desincronizarse — que es exactamente
   lo que le pasó a esta.

**Changelog:**
- 10-sep-2026 — documento creado al retirar el subsystem de la base real, durante la
  investigación previa al baseline de Prisma (U2).

# Handoff técnico

```
CORTE:   10-sep-2026 (corte 3)
HEAD:    esta unidad, publicada encima de `e8918e6` en dos commits (`e3b95a1`,
         `6fb3bd5`). Ver §7
RAMA:    main
UNIDAD:  EJECUTAR LA INGESTA CORREGIDA CONTRA LA BASE REAL. Construye lo que el corte 2
         dejó diseñado pero sin construir — el modelo de buzón compartido (F10) — lo
         aplica contra la VPS real y **lo ejercita de punta a punta con éxito por
         primera vez**. `codigo_area` resultó ya existir en la base viva (contradicción
         nombrada, no bloqueante). El primer intento de ejecución en n8n repitió el
         mismo error porque el usuario había publicado la copia del workflow sin el fix
         (confusión entre dos archivos llamados "2.1", ver F11); tras reimportar el
         archivo correcto (commit `e3b95a1`), la ingesta corrió completa: 2.559 → 2.825
         tickets (+266 nuevos), 155 → 165 tickets del buzón compartido (+10), todos
         atribuidos al marcador histórico, ninguno a la ocupante actual — la regla dura
         se cumple también sobre datos nuevos, no solo sobre los 155 ya conocidos.
CAMBIOS DE ESTA UNIDAD:
         - `sql/db/04_core.sql`: columna `es_responsable_historico_no_identificado` +
           índice único parcial en `core.dim_personal`.
         - `sql/elt/04_transform_personal_historico.sql`: marca la columna en `TRUE`
           para toda fila que infiere.
         - `sql/elt/06_transform_ticket.sql`: valida buzones compartidos sin marcador
           único (aborta si los encuentra) y resuelve `sol`/`asig` con
           `LEFT JOIN LATERAL` priorizando la fila histórica en vez del `LEFT JOIN`
           directo que producía el `ON CONFLICT ... cannot affect row a second time`.
         - `n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`: mismo
           fix aplicado a la copia embebida (el workflow no lee los `.sql` del
           repositorio, trae su propia copia del texto de cada query) — hallazgo F11.
         - `docs/specs/tickets.md` §7.3, `docs/estado/operacion.md` (regla dura de no
           acceso directo a la VPS; valores reales de conexión en vez de placeholders).
         - **Aplicado y ejercitado contra la VPS real** (10-sep-2026, por el usuario,
           manualmente): `ALTER TABLE`/`UPDATE`/`CREATE INDEX` sobre `core.dim_personal`,
           reimportación del workflow a n8n, ejecución completa de la ingesta.
STAGING: no aplica. No hay entorno de pruebas declarado para este proyecto
LINT:    no ejecutado sobre `coraje-web/`. Se tocó SQL y workflows de n8n, no
         TypeScript. No hay build ni typecheck que verifique SQL o JSON de n8n — la
         validación real fue la ejecución contra la VPS y n8n, con evidencia en §4
```

> **Corrección al propio documento:** este es el primer corte. No hay unidades previas
> que conservar, y las secciones que en el proyecto hermano acumulan histórico nacen
> aquí vacías a propósito, no por omisión.

**Qué es este documento:** el estado observado, la evidencia disponible, las
incertidumbres y **una sola acción inmediata**, con fecha de corte explícita. No
contiene decisiones estables (`contexto-canonico.md`), contratos funcionales (`specs/`),
runbook operativo (`estado/operacion.md`) ni la cola de trabajo
(`estado/plan-ejecucion.md`).

**Cómo se actualiza:** la **estructura** —secciones y campos— es durable y no cambia. La
**instantánea** —todo su contenido— se reemplaza al cerrar cada unidad, siguiendo §8.

## 1. Veredicto operativo

**Lo que está cerrado:** el conjunto documental existe, es coherente y cada afirmación
sobre el código está marcada como verificada o como pendiente de verificar.

**Lo que no:** absolutamente nada del producto. No hay autenticación, no hay
autorización, no hay contrato de diseño, no hay ciclo de vida del ticket y no hay una
sola prueba automatizada. El proyecto tiene una base de datos sólida con datos reales y
una capa de aplicación que es un prototipo.

**Salvedad sobre lo que parece cerrado.** Escribir la especificación no adelanta la
implementación. Tres de las cinco specs están además **bloqueadas por hechos que nadie
ha medido**, no por trabajo pendiente: sin el levantamiento de PowerApps y sin las cinco
consultas de U1, lo que se construya será diseño por analogía.

## 2. Estado por fase

| Fase | Estado | Evidencia o bloqueo |
|---|---|---|
| Ingesta SharePoint → PostgreSQL | `EJERCITADO, con el código corregido de esta unidad` | 2.313 tickets conciliados en `legacy/baseline-calidad.md` (baseline histórico, no se edita) → 2.559 el 10-sep-2026 antes de esta unidad → **2.825 el 10-sep-2026 tras ejecutar la ingesta con el fix de F10** (§4). El crecimiento es la ingesta incremental real, confirmado por el usuario — no es un error de conteo |
| Salida PostgreSQL → SharePoint | `CONSTRUIDO, NUNCA EJERCITADO` | Ningún cliente radicó nunca. El workflow consumidor **existe y su diseño es correcto** (escribe referencia legacy, tiene respaldo cada 12h), pero vive sin commit y mal nombrado (F5) |
| Portal de clientes | `PROTOTIPO, A RETIRAR` | Selector abierto sin credencial |
| Redirección interna | `PROTOTIPO, A RETIRAR` | Contraseña compartida, sin identidad de persona |
| Identidad de empleados | `NO EXISTE` | Contrato escrito, bloqueado por U1 §1 y U2 |
| Autorización | `NO EXISTE` | Contrato escrito, bloqueado por U0 |
| Ciclo de vida del ticket | `NO EXISTE` | Modelo de datos presente; bloqueado por U0 |
| Sistema de diseño | `NO EXISTE` | Contrato escrito |
| Observabilidad | `NO EXISTE` | Ni alertas, ni reconciliación, ni correlación |
| Documentación | `CERRADA en este corte` | Este conjunto |

## 3. Capacidades publicadas en esta unidad

Ninguna capacidad de producto. Lo entregado es documental:

- `CLAUDE.md` reescrito, con la autorización destructiva y sus límites, las fronteras de
  herramientas, la disciplina de contexto y las convenciones de commit.
- `docs/contexto-canonico.md`, `docs/README-documentacion.md`.
- Cinco specs: acceso de empleados, acceso de clientes, tickets, sincronización con
  SharePoint, permisos.
- `docs/design/sistema-helpdesk.md`.
- `docs/estado/`: este handoff, plan de ejecución, runbook de operación, backlog.
- `docs/legacy/`: cuatro documentos movidos sin alterar su contenido.

## 4. Evidencia disponible

| Tipo | Demuestra | **No** demuestra |
|---|---|---|
| Lectura del árbol de HelpDesk | Qué contiene el código y el SQL hoy | Que funcione, ni qué hace en ejecución |
| Lectura del árbol de Impulsa | Cómo resolvió el proyecto hermano identidad, permisos y diseño | Que esas piezas funcionen aquí sin adaptación |
| `git log` y `git status` | Que el árbol estaba limpio y cuál es el HEAD | Nada sobre despliegues |
| `legacy/baseline-calidad.md` | Que la carga inicial cuadró **en su momento** (fecha no fijada, anterior al 03-sep-2026) | Que siga cuadrando hoy — **ver contradicción abajo** |
| 3 consultas SQL en la VPS (U1 §1, §4, §5) + lectura directa de `n8n/` (U1 §2, §3), ambas **10-sep-2026** | Ver tabla siguiente — las cinco preguntas de U1 | Que la instancia viva de n8n tenga hoy exactamente lo que el archivo exportado describe (nota al pie de esta sección) |

**U1 — resultados reales, contra la base de producción, 10-sep-2026:**

| # | Pregunta | Resultado | Lectura |
|---|---|---|---|
| 1 | Personal con correo corporativo activo | **167** filas | Alcance del alta de directorio (`acceso-empleados.md` §7.1) |
| 4 | Estados y prioridades reales de `fact_ticket` | `ABIERTO`/`BAJA`=20, `ABIERTO`/`MEDIA`=26, `CERRADO`/`BAJA`=625, `CERRADO`/`MEDIA`=1885, `CERRADO`/sin prioridad=3. **Cero** `RECHAZADO`. **Cero** prioridad `ALTA` (coherente: no existe en el catálogo) | Total: **2.559** tickets — ver contradicción abajo. Los "3 sin prioridad" sí coinciden con `baseline-calidad.md` |
| 5 | Filas en `ticket_sync_outbox` | **0 filas**, ninguna en ningún estado | Coherente con "Salida PostgreSQL → SharePoint: `CONSTRUIDO, NUNCA EJERCITADO`" (§2) — no hay nada colgado porque nunca corrió nada. Cero filas en el outbox también es evidencia indirecta de que el crecimiento de tickets (ver abajo) no viene del portal: crear desde el portal encolaría salida, y no hay ninguna |

> **`CONTRADICCIÓN`, nombrada y ahora explicada.** `baseline-calidad.md` concilió 2.313
> tickets. La consulta real de hoy cuenta **2.559** — 246 más. **Confirmado por el
> usuario:** la ingesta incremental de SharePoint siguió corriendo desde que se tomó el
> baseline y trajo esos tickets reales adicionales. No es un error de conteo ni un
> baseline mal tomado. `baseline-calidad.md` no se edita retroactivamente (queda como lo
> que confirmó en su momento, con su propia fecha); esta tabla es la cifra vigente.

**F10 — ejecución real de la ingesta corregida, 10-sep-2026, contra `coraje_postgres`/
`coraje` en la VPS de producción, por el usuario:**

| Consulta | Antes de esta unidad | Después de ejecutar la ingesta corregida |
|---|---|---|
| `SELECT COUNT(*) FROM helpdesk.fact_ticket` | 2.559 | **2.825** (+266) |
| Tickets con `id_asignado`/`id_solicitante` apuntando al marcador histórico del buzón compartido | 155 | **165** (+10) |

Confirma tres cosas a la vez: (1) la ingesta corrió de verdad y procesó trabajo nuevo,
no fue un no-op; (2) el fix de F10 no solo resolvió el error de los 155 tickets ya
conocidos — también resolvió correctamente los 10 tickets nuevos que llegaron
referenciando el mismo buzón compartido, sin que nadie tuviera que intervenir caso por
caso; (3) ninguno de los 165 quedó atribuido a la ocupante actual del buzón — la regla
dura se sostiene sobre datos que no existían cuando se diseñó el fix, no solo sobre el
caso conocido de antemano.

**Incidencia real durante la ejecución, resuelta:** el primer intento de correr la
ingesta en n8n repitió el mismo error (`PG - Transform 06 Tickets Legacy`, `ON CONFLICT
... cannot affect row a second time`) porque el usuario había publicado la copia del
workflow **sin** el fix — confusión entre el archivo commiteado
(`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`, con el fix) y una
copia suelta con nombre parecido (`...V2.1...json`, sin commit, sin el fix). Se
descartó en paralelo una segunda hipótesis (que `core.dim_cliente_contai` tuviera el
mismo defecto de correo/identificación duplicada que `dim_personal`): la consulta
`GROUP BY identificacion_fiscal HAVING COUNT(*) > 1` no devolvió ninguna fila. Tras
reimportar el archivo correcto, la ejecución completó sin error.

**Comprobado en entorno real:** las tres consultas SQL de U1, 10-sep-2026, contra
`coraje_postgres`/`coraje` en la VPS de producción. El contenido real de
`n8n/REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json`, leído esa misma
fecha: es el consumidor del outbox, mal nombrado.

**No conocido:** si el despliegue en Coolify está activo más allá de que la base
responda; el comportamiento funcional de PowerApps. **Resuelto en esta unidad:** el
workflow de ingesta activo en la instancia real de n8n hoy es el archivo commiteado
con el fix de F10 — confirmado por ejecución real, no por inspección del export
(`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`, commit `e3b95a1`).

## 5. Fallos abiertos

| # | Fallo | Severidad | Dónde |
|---|---|---|---|
| F1 | El portal permite operar a nombre de cualquier cliente sin credencial | **Alta** | `specs/acceso-clientes.md` §1 |
| F2 | La redirección usa contraseña compartida; no hay traza de quién redirigió | **Alta** | `specs/acceso-empleados.md` §1 |
| F3 | El ELT sobrescribe todos los campos con SharePoint y pierde la procedencia del portal | **Alta** | `specs/sincronizacion-sharepoint.md` §4.1 |
| ~~F4~~ | ~~Posible duplicado por eco~~ — **cerrado 10-sep-2026**: el workflow sí escribe la referencia legacy antes de marcar `SENT`. Resuelto en diseño; sigue sin ejercitarse con un ticket real | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §4.2 |
| ~~F10~~ | ~~`core.dim_personal` tenía dos filas con el mismo `correo_corporativo`~~ — **cerrado 10-sep-2026, con ejecución real.** `recepcion.gct@rbcol.co` tenía `ccb2a1de...` (activa) y `ef1e69e7...` (fantasma). Esquema aplicado (`es_responsable_historico_no_identificado`, índice único parcial) y la ingesta corrió de punta a punta sin error: 2.559 → 2.825 tickets, 155 → 165 atribuidos al marcador histórico, ninguno a la ocupante actual (§4). El primer intento falló porque n8n tenía publicada la copia sin el fix (confusión de nombres, ver F11) — resuelto reimportando el archivo correcto | ~~Alta~~ | `core.dim_personal`; `specs/tickets.md` §7.3 |
| F11 | `sql/elt/06_transform_ticket.sql` (el archivo del repositorio) y el nodo `PG - Transform 06 Tickets Legacy` del workflow de n8n **tienen lógica distinta para clasificar `tipo_requerimiento`/`categoria_1`/`categoria_2` legacy** — descubierto al extraer la query embebida del workflow para aplicarle el fix de F10. La versión de n8n resuelve más casos reales (p. ej. tickets que ya traen `PROYECTOS Y TI` como tipo, o que necesitan repartirse entre `AUTOMATIZACION`/`TI` según `categoria_2`); la versión del archivo `.sql` solo cubre el caso simple `AUTOMATIZACION`/`TI` → `PROYECTOS Y TI`. El archivo `.sql` es, en la práctica, **el que se ejecutó manualmente para diagnosticar F10** (según el corte 2) — no el que corre en n8n. No se sabe si la versión de n8n se refinó directamente ahí sin volcarse nunca al repositorio, o si es al revés. **No se resolvió en esta unidad** (fuera de alcance de F10: exige decidir cuál lógica es la correcta y por qué divergieron, no solo copiar una sobre la otra) — ver `operacion.md` para el patrón ya documentado de que n8n trae su propia copia de cada query y no lee `sql/elt/` | Media — no bloquea hoy, pero el archivo `.sql` no es fuente de verdad fiable para esta transformación específica | `sql/elt/06_transform_ticket.sql` vs. `n8n/CORAJE - INCREMENTAL COMPLETO...json` |
| ~~F5~~ | ~~El workflow de salida no está commiteado~~ — **cerrado 10-sep-2026**: commiteado con nombre correcto (`n8n/CORAJE - SALIDA - PostgreSQL to SharePoint.json`, commit `1de8641`). Pendiente real: activarlo en la instancia viva de n8n, que sigue sin confirmarse | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §2.2 |
| F6 | Una sola credencial de base para migrar y para servir | Media | `estado/operacion.md` |
| F7 | `.env.example` declara una de las cuatro variables que el código lee | Baja | Ídem |
| F8 | El SLA no se pausa, no se recalcula y no existe prioridad `ALTA` | Media | `specs/tickets.md` §5 |
| F9 | `encargado_interno` es texto libre sin clave foránea | Baja | Ídem §7.2 |

## 6. Riesgos abiertos

| Riesgo | Impacto | Control inmediato |
|---|---|---|
| Construir el ciclo del ticket sin levantar PowerApps | Rechazo de los empleados al migrar | U0, iniciado ya por su latencia |
| Crear tablas antes de decidir el modelo de esquema | Dos historias de esquema divergentes | U2 bloquea toda unidad que cree tablas |
| El equipo trabaja en la plataforma y la ingesta le borra el trabajo | Pérdida de trabajo real | U9 antes de que U7 esté en uso |
| Un cliente radica y el ticket se duplica en SharePoint | Visible para PowerApps y para el cliente | Reducido, no eliminado: el diseño del workflow ya no duplica (U1 §2, `sincronizacion-sharepoint.md` §4.2), pero sigue sin ejercitarse con un caso real — probarlo con el primer ticket real del portal antes de anunciarlo cerrado |
| La autorización destructiva alcanza datos reales | Pérdida irrecuperable | `contexto-canonico.md` §1.3 delimita el alcance |
| Se retiró el ciclo local antes de que exista el servicio `migrate` gateado que lo reemplaza | Entre esta decisión y que U2 construya ese servicio, no hay ninguna forma documentada de verificar comportamiento — ni local, ni por push | Construir U2 (baseline Prisma + servicio `migrate`) antes de apoyarse en "verificar por push" como si ya existiera |
| ~~`n8n/` tiene tres archivos sin commit~~ — **cerrado 10-sep-2026**: el consumidor del outbox quedó renombrado y commiteado (`1de8641`); cuál copia de la ingesta es la real quedó confirmado por ejecución (la del archivo commiteado, `e3b95a1`, tras corregir una confusión real donde se publicó primero la copia sin fix). **Abre uno nuevo, más acotado:** las copias `V2` y `V2.1` siguen en disco en la VPS y en n8n, sin commit — limpiarlas | Confusión futura si alguien las reactiva por error, ahora que ya se confirmó cuál es la real | Borrar `V2`/`V2.1` del disco de la VPS y de n8n — pendiente, ver Acción inmediata |
| El workflow de ingesta committeado embebe su propia copia de cada query SQL — **no la lee de `sql/elt/`**. **Materializado, no solo teórico:** el primer intento de correr la ingesta en esta unidad falló porque se publicó una copia de n8n sin el fix; se resolvió reimportando el archivo correcto. Ningún commit, por sí solo, cambia lo que n8n ejecuta — sigue siendo cierto para el próximo fix | Repetir el mismo incidente en la próxima corrección: escribir el fix en `sql/elt/`, olvidar reimportarlo a n8n, y que la instancia viva siga corriendo la versión vieja sin que nada lo avise | Antes de dar por aplicado cualquier cambio a `sql/elt/06_transform_ticket.sql` (o cualquier archivo que un nodo de este workflow embeba), confirmar explícitamente que se reimportó a la instancia viva — no asumir por el nombre o la fecha del archivo local; ver F11 sobre la divergencia de `tipo_legacy` entre ambas copias, que ningún reimport futuro corrige por sí solo |

## 7. Commits relevantes

| Commit | Cambio |
|---|---|
| `e8918e6` | **Corte vigente antes de esta unidad.** Actualiza cabecera, commits y acción inmediata del handoff al estado real tras el hallazgo de F10 |
| `e2ffb24` | Retira `create-copilot-export.sh`, sin relación con HelpDesk |
| `d5efa5a` | Documenta consultas SQL directas contra la VPS y el gate de `migrate` |
| `52aed2a` | Versiona `.claude/skills/` |
| `1de8641` | Corrige Proyectos y TI como tipo, no área; añade `codigo_area`; commitea el consumidor del outbox |
| `6a54bde` | Cierre de U0/U1: decisiones de esquema, SLA, permisos ratificados, F10 descubierto |
| `6ae29e1` | Línea base documental completa |
| `a5d8347` | Estabiliza el ETL incremental SharePoint → PostgreSQL |

---

## ACCIÓN INMEDIATA

**Confirmar si el consumidor del outbox está activo en n8n, y borrar `V2`/`V2.1` del
servidor y de n8n.** Es lo único que queda abierto de esta unidad — ver paso 3. Todo lo
demás (1, 2 y 4 abajo) está cerrado con evidencia real del 10-sep-2026: la ingesta
corrió de punta a punta y F10 quedó resuelto (§4, §5). Cerrado ese residuo, esta unidad
termina y U2 es la cabeza natural de la cola (`plan-ejecucion.md`) — salvo que el
usuario prefiera atender F11 primero, nuevo hallazgo sin resolver, ver más abajo. Los
bloques de comando de 1, 2 y 4 se dejan como referencia de lo que se corrió, no como
pendientes — no hace falta repetirlos.

**1. `codigo_area` en `core.dim_area` — CERRADO, con una contradicción nombrada.**
Al correr el comando de abajo, la VPS respondió `ERROR: column "codigo_area" of
relation "dim_area" already exists` (10-sep-2026). Contradice lo que este documento
afirmaba (que no existía en la base viva) — no hay registro de quién ni cuándo la
aplicó. No bloquea nada: es aditiva, y `01_transform_area.sql` hace `ON CONFLICT
(nombre_area)`, no `(codigo_area)`, así que el `UPSERT` funciona exista o no el
`UNIQUE` real sobre esa columna. Queda como estado real confirmado, no como acción
pendiente — el comando ya no hace falta correrlo.

```bash
# Ya no hace falta correr esto — se deja como referencia de lo que se intentó y del
# error real que confirmó que la columna ya existía.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
ALTER TABLE core.dim_area ADD COLUMN codigo_area VARCHAR(10) UNIQUE;
"
```

**2. Modelo de buzón compartido en `core.dim_personal` (F10) — CERRADO, con evidencia
real (10-sep-2026):** 2a devolvió exactamente las dos filas esperadas
(`ccb2a1de...` activa, `ef1e69e7...` fantasma); 2b-2d corrieron sin error
(`ALTER TABLE`, `UPDATE 1` exacto, `CREATE INDEX` sin violación); 2e devolvió 0 filas.
El esquema está resuelto y verificado contra la base real. Se deja el bloque como
referencia — no hace falta repetirlo.

```bash
# 2a. Verificación previa (solo lectura): confirmar que sigue habiendo exactamente
# dos filas para el correo compartido conocido, antes de tocar nada.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
SELECT id_personal, sp_personal_id, correo_corporativo, cargo, estado_activo
FROM core.dim_personal
WHERE correo_corporativo = 'recepcion.gct@rbcol.co';
"
```

Si esa consulta **no** devuelve exactamente dos filas (una con `cargo = 'EX-EMPLEADO
(RECUPERADO DEL HISTORIAL)'`), detenerse — el resto de los comandos asume ese estado.

```bash
# 2b. Columna nueva, aditiva y reversible.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
ALTER TABLE core.dim_personal
    ADD COLUMN es_responsable_historico_no_identificado BOOLEAN NOT NULL DEFAULT FALSE;
"

# 2c. Backfill de la única fila fantasma conocida. Debe reportar 'UPDATE 1' — si
# reporta un número distinto de 1, detenerse y no seguir a 2d.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
UPDATE core.dim_personal
SET es_responsable_historico_no_identificado = TRUE
WHERE correo_corporativo = 'recepcion.gct@rbcol.co'
  AND cargo = 'EX-EMPLEADO (RECUPERADO DEL HISTORIAL)'
  AND estado_activo = FALSE;
"

# 2d. Índice único parcial: a lo sumo un marcador histórico por correo.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
CREATE UNIQUE INDEX ux_dim_personal_correo_historico
ON core.dim_personal (correo_corporativo)
WHERE es_responsable_historico_no_identificado;
"

# 2e. Verificación final: debe devolver CERO filas. Si devuelve alguna, la
# transformación de tickets (paso 4) abortará con la misma condición — mejor
# encontrarlo aquí que a mitad de la ingesta.
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
SELECT correo_corporativo, COUNT(*) AS filas,
       COUNT(*) FILTER (WHERE es_responsable_historico_no_identificado) AS marcadas
FROM core.dim_personal
WHERE correo_corporativo IS NOT NULL
GROUP BY correo_corporativo
HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE es_responsable_historico_no_identificado) <> 1;
"
```

**3. n8n — CERRADO en lo esencial, un residuo pendiente.** Incidencia real y resuelta:
el primer intento de ejecutar la ingesta se hizo con la copia **sin** el fix
(`CORAJE - INCREMENTAL COMPLETO V2.1 - SharePoint to PostgreSQL.json`, suelta en el
servidor, sin commit) publicada por confusión de nombre con el archivo commiteado que
sí lo trae. Al reimportar `n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to
PostgreSQL.json` (commit `e3b95a1`), la ingesta corrió sin error. **Pendiente, acotado:**
- Confirmar si el consumidor del outbox (`CORAJE - SALIDA - PostgreSQL to
  SharePoint.json`, commiteado en `1de8641`) está activo — sigue sin confirmarse.
- Borrar del servidor y de n8n las copias que ya no hacen falta: `V2` y la `V2.1` sin
  commit que causó la confusión.

**4. Ejecución real — CERRADA, con evidencia inequívoca (10-sep-2026).** Tras
reimportar el workflow correcto: `total_tickets` **2.559 → 2.825** (+266, prueba de que
sí procesó trabajo nuevo, no fue un no-op) y `tickets_del_buzon_compartido` **155 →
165** (+10, los diez tickets nuevos que también referencian el buzón compartido
quedaron en el marcador histórico, no en la ocupante actual — la regla dura se cumple
también sobre datos que no existían cuando se diseñó el fix). Consultas de referencia:

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
SELECT COUNT(*) AS total_tickets FROM helpdesk.fact_ticket;
SELECT COUNT(*) AS tickets_del_buzon_compartido
FROM helpdesk.fact_ticket
WHERE id_asignado IN (
    SELECT id_personal FROM core.dim_personal
    WHERE es_responsable_historico_no_identificado
) OR id_solicitante IN (
    SELECT id_personal FROM core.dim_personal
    WHERE es_responsable_historico_no_identificado
);
"
```

> **F11, nuevo en esta unidad, deliberadamente sin resolver aquí:** la lógica de
> clasificación de `tipo_requerimiento` legacy diverge entre `sql/elt/06_transform_
> ticket.sql` y la copia embebida en n8n — la de n8n cubre más casos reales. No se
> reconcilió porque es un problema distinto de F10 y merece su propia unidad: decidir
> cuál versión es la correcta y por qué divergieron, no copiar una sobre la otra a
> ciegas.

> **En paralelo, y no después: U0**, el levantamiento funcional de PowerApps. Su cuello
> de botella es la disponibilidad de otras personas, no el trabajo, así que empezarlo
> tarde retrasa todo lo demás. Es la única excepción declarada a la regla de una sola
> unidad a la vez.

---

## Decisiones tomadas y NO implementadas

| Decisión | Dónde | Estado |
|---|---|---|
| Ningún token viaja entre Conecta y HelpDesk; cada módulo hace su propio OIDC | `specs/acceso-empleados.md` §2 | Decidida, no construida |
| SSO silencioso con `prompt=none` para eliminar la fricción del botón | Ídem §4 | Decidida, no construida |
| El acceso de clientes se ancla al cliente, no al ticket | `specs/acceso-clientes.md` §3 | Decidida, no construida |
| Estado del ticket derivado de eventos, con escritor único | `specs/tickets.md` §3 | Decidida, no construida |
| Rediseño visual completo, sin fase de centralización posterior | `design/sistema-helpdesk.md` §1 | Decidida, no construida |
| Tipografía Lato, con pesos reales 400/500/600/700 | Ídem §2 | Decidida, no construida |
| HelpDesk se lee como parte de Conecta: su sidebar, su URL, sin enlace de vuelta | `contexto-canonico.md` §1.1 | Decidida, no construida |
| Economía de recursos de la VPS como criterio permanente de diseño | Ídem §1.2 | Decidida, sin línea base medida |
| Modelo de esquema: migraciones Prisma completas, se abandona SQL a mano (D1) | `contexto-canonico.md` §4 | Decidida, no construida — U2 hace el baseline |
| Consulta de tickets se acota por permiso, no queda sin restricción como en el legacy | `legacy/reglas-negocio-powerapps.md` §13.6 | Decidida, no construida |
| Se retira del runbook el ciclo de desarrollo local; la verificación funcional es siempre vía commit + push a lo desplegado | `estado/operacion.md` | Decidida, no construida — falta el servicio `migrate` que la sostenga (ver riesgo nuevo abajo) |
| Convención de nombres del modelo Prisma: `PascalCase` con `@@map` a `snake_case`, igual que Impulsa (D1') | `contexto-canonico.md` §4 | Decidida, no construida — mapear cada tabla/columna de las tres schemas es trabajo mecánico de U2 |
| Observadores (watchers de solo lectura) van en v1, a partir del prototipo `helpdesk_santi/` | `specs/tickets.md` §11, `specs/permisos.md` §10 | Decidida, no construida — depende del catálogo de personas/roles todavía `ABIERTO` |
| Solicitud de validación dirigida a persona va en v1, distinta de la autorización excepcional | Ídem | Decidida, no construida — sin decidir aún si bloquea el avance del ticket |
| U0 pregunta 1 (¿espera al cliente?): sí hace falta un estado, generalizado a `ESPERANDO_SOLICITANTE`; el SLA se **reinicia completo** al salir, no se pausa — riesgo aceptado explícitamente | `specs/tickets.md` §4, §5 | Decidida, no construida |
| U0 pregunta 4: la excepción de `alexbolanos@rbcol.co` para `PROYECTOS Y TI` sigue vigente | `legacy/reglas-negocio-powerapps.md` §5, §13.5 | Confirmada por el usuario. Ya decidido normalizarla como fila de tabla, no como código quemado |
| U0 pregunta 2: Jimena Tejeiro no tiene nada especial en su rol frente a Legal — es exactamente el mismo caso que Alex para Proyectos y TI, la responsable normal del área. Quitando la pantalla fusionada (interfaz, no se replica) y el puente a `TareasLegal` (aplazado), no queda ninguna regla de negocio distinta que conservar | `legacy/reglas-negocio-powerapps.md` §11 | Cerrada. Legal se enruta igual que cualquier otra área en la tabla de enrutamiento, sin comparación de identidad en el código |
| U0 pregunta 5: no requiere ningún mecanismo de producto. Reportar y cerrar con las acciones realizadas es responsabilidad de quien resuelve o de quien radicó, no algo que la aplicación pueda detectar | — | Cerrada, sin acción de diseño |
| Modelo de buzón compartido (F10): columna `es_responsable_historico_no_identificado` en `core.dim_personal` (no rango de fechas — sin evidencia de cuándo cambió de manos el buzón), resuelto por `LEFT JOIN LATERAL` con prioridad a la fila histórica. **Bajo ninguna circunstancia** los 155 (hoy 165) tickets históricos quedan a nombre de Eilyn (la ocupante actual) | `specs/tickets.md` §7.3 | **Construida y ejercitada contra la base real** (10-sep-2026): ingesta corrida de punta a punta sin error, 155 → 165 tickets confirmados en el marcador histórico |

## Decisiones que faltan y bloquean

| # | Decisión | Bloquea | Quién decide |
|---|---|---|---|
| D2 | Qué ve un contacto: sus tickets o los de su empresa | El modelo de acceso externo | Usuario |
| D3 | Si el acceso de cliente vence o solo se revoca | Ídem | Usuario |
| D4 | Por dónde sale el correo del portal | Invitaciones y OTP | Usuario |
| D5 | Acento visual propio del módulo o compartido con Impulsa | Materialización del tema | Usuario |
| D6 | Si se pide `Mail.Send` en el primer consentimiento de Entra | Evitar una segunda ronda de consentimiento por empleado | Usuario |
| D7 | Mecanismo de integración con Conecta: *reverse proxy*, subdominio con shell replicado u otro | Cookies, rutas, despliegue y el shell entero | Usuario y responsable de Conecta |

> **D7 se resuelve inspeccionando Conecta**, que este conjunto documental no ha visto.
> Es la única decisión que depende de un sistema fuera de estos dos repositorios.

> **D6 tiene ventana.** Pedirlo después significa que cada empleado vuelva a consentir.
> Si HelpDesk va a enviar correo alguna vez, la decisión es **antes** del primer
> despliegue de identidad, no cuando aparezca la necesidad.

## Consecuencias vigentes que no son defectos

- **No hay pruebas automatizadas y eso no bloquea este corte**, porque no hubo código. Sí
  bloquea el criterio de cierre de U3 en adelante: sus condiciones exigen pruebas
  negativas.
- **El ELT está bien escrito para lo que se escribió.** Su precedencia incondicional
  hacia SharePoint es correcta en una migración one-way; se convierte en defecto solo
  cuando la plataforma pasa a ser interfaz de trabajo. Es ausencia de una decisión, no
  un error.
- **La carpeta se sigue llamando `coraje-web/`.** Renombrarla tocaría `Dockerfile`,
  compose y despliegue sin ganar nada hoy. Declarado, no pendiente.

---

## 8. Procedimiento de actualización (durable)

Al cerrar cada unidad de trabajo, reemplazar la instantánea conservando esta estructura:

1. **Cabecera** — corte, HEAD, rama, unidad, cambios locales no incluidos.
2. **§1 Veredicto** — qué está cerrado, qué no, y las salvedades sobre lo aparentemente
   cerrado.
3. **§2 Estado por fase** — actualizar solo las filas que cambiaron, **con evidencia**.
4. **§3 Capacidades** — añadir lo publicado en esta unidad.
5. **§4 Evidencia** — qué se demostró y **contra qué HEAD**. Nunca extrapolar entre
   cortes ni de un entorno a otro.
6. **§5–6 Fallos y riesgos** — retirar los cerrados **con evidencia**, añadir los nuevos.
   Los retirados se tachan con su fecha y su razón; no se borran.
7. **§7 Commits** — añadir el commit de la unidad.
8. **Acción inmediata** — **una sola**. Debe ser la cabeza de la cola de
   `estado/plan-ejecucion.md`, o declarar explícitamente que se desvía y por qué.

**Registro de cierre de la unidad:** estado previo · cambio · evidencia · incidencias y
resolución · decisión (cerrada / parcial / revertida / diferida) · commit · documentación
actualizada.

**Vocabulario de estado.** No es binario y no se colapsa: `construido` (typecheck, lint,
build, pruebas) ≠ `publicado` (commit en `origin/main`) ≠ `desplegado` ≠ `ejercitado`
(alguien lo ejecutó contra base o navegador). Las coletillas `SIN EJERCITAR`,
`SIN DESPLEGAR` y `SIN COMMIT` son parte del estado, no adorno.

**Changelog:**
- 03-sep-2026 — línea base del handoff. Primer corte: conjunto documental completo
  escrito y evidencia legacy reubicada, sin una línea de código tocada y sin publicar.
- 03-sep-2026 (mismo día) — se registran tres decisiones de usuario: D1 (migraciones
  Prisma completas, se abandona SQL a mano), retiro del ciclo local del runbook, y
  acotar `Consulta` por permiso. Se abre D1' (convención de nombres del modelo Prisma,
  sin resolver) y un riesgo nuevo: la retirada del ciclo local antecede a que exista el
  servicio `migrate` que la sostiene. Sigue sin haber una sola línea de código tocada.
- 03-sep-2026 (mismo día) — D1' resuelta: `PascalCase` con `@@map` a `snake_case`,
  igual que Impulsa. Confirmado el orden de implementación (U1+U0 antes que cualquier
  construcción); prioridad declarada para cuando U2 empiece: el servicio `migrate`.
- 03-sep-2026 (mismo día) — a partir del prototipo `helpdesk_santi/` (concepto, no
  visual): se confirman Observadores y Solicitud de validación para v1
  (`specs/tickets.md` §11, `specs/permisos.md` §10 y §3). U1 sigue bloqueado por falta
  de acceso a Docker/VPS desde esta sesión; las cinco preguntas de U0 quedan
  pendientes, sin delegar, respondidas con el tiempo.
- 03-sep-2026 (mismo día) — se cierran cuatro de cinco preguntas de U0: nuevo estado
  `ESPERANDO_SOLICITANTE` con SLA de reinicio completo (riesgo aceptado), Alex y Jimena
  confirmados sin rol adicional, pregunta 5 cerrada sin acción de diseño. `permisos.md`
  §6 pasa de `ABIERTO` a `RATIFICADO (parcial)`. Pregunta 3 sigue aplazada por decisión
  previa. U1 sigue sin ejecutarse: sin Docker ni acceso a la VPS desde esta sesión.
- 10-sep-2026 — las tres consultas SQL de U1 se ejecutan contra la VPS real (root, vía
  `docker exec`), fuera de esta sesión. Resultados registrados en §4. Se nombra una
  contradicción sin resolver: el conteo real de tickets (2.559) no coincide con el
  baseline conciliado (2.313, `legacy/baseline-calidad.md`). Quedan sin responder las
  dos preguntas de n8n — U1 sigue sin cerrar. Sigue sin publicarse ni un commit de todo
  lo acumulado desde el 03-sep-2026.
- 10-sep-2026 (mismo día) — **U1 cierra.** El usuario confirma la causa del conteo
  (ingesta incremental sigue corriendo). Lectura directa de `n8n/` revuelve que el
  consumidor del outbox **sí existe**, mal nombrado como
  `REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json` y sin commit, y que su
  código **sí escribe la referencia legacy** antes de marcar `SENT` — F4 cerrado en
  diseño. Confirmado cron de respaldo (12h + requeue) y ausencia de workflow de error.
  Se descubren dos copias inactivas y sin commit de la ingesta (`V2`, `V2.1`), cada una
  con `id` de workflow propio. Nueva acción inmediata: publicar el corte, renombrar y
  commitear el consumidor, y confirmar en n8n cuál ingesta sigue activa antes de U2.
  Sigue sin publicarse un solo commit desde el 03-sep-2026.
- 10-sep-2026 (mismo día) — **corte 2, publicado (`e2ffb24`).** Ejecutando V2.1
  manualmente aparece `ON CONFLICT ... cannot affect row a second time`: diagnosticado
  hasta la causa exacta, `core.dim_personal` duplicado por correo compartido
  (`recepcion.gct@rbcol.co`), 155 tickets reales afectados. El usuario decide la
  dirección (modelo de buzón compartido, nunca atribuir a la ocupante actual) y elige
  V2.1 como versión a mantener — que corrige Proyectos y TI como tipo, no área, y exige
  `codigo_area` nueva en `core.dim_area`. Se commitea y publica todo: la corrección de
  ingesta, el consumidor del outbox renombrado, `.claude/skills/`, la documentación del
  patrón de consulta SQL directa, y el retiro de `create-copilot-export.sh`. **Ninguna
  de las dos correcciones (`codigo_area`, buzón compartido) se aplicó todavía contra la
  base real** — siguen solo en el código. Nueva acción inmediata en consecuencia.
- 10-sep-2026 (mismo día, corte 3) — se construye el diseño de F10: columna
  `es_responsable_historico_no_identificado` en `core.dim_personal`, `LEFT JOIN LATERAL`
  con prioridad a la fila histórica en `06_transform_ticket.sql`, índice único parcial,
  validación que aborta ante ambigüedad sin marcador (`specs/tickets.md` §7.3, detalle
  del diseño). Durante la sesión se intentó `ssh`/`docker exec` directo a la VPS para
  verificar conectividad; el usuario lo detuvo y pidió que quedara como regla dura
  documentada (`operacion.md`) — ninguna sesión vuelve a intentarlo, todo comando de
  producción se entrega como texto. Se descubre F11: la copia de `06_transform_ticket`
  embebida en el workflow de n8n tiene una lógica de clasificación de tipo_requerimiento
  distinta (más completa) que el archivo `sql/elt/` del repositorio — el workflow no lee
  los `.sql` del repositorio, trae su propia copia de cada query. El fix de F10 se aplicó
  a ambas copias (repositorio y JSON de n8n) preservando la lógica más completa de n8n,
  sin reconciliar F11 (fuera de alcance de esta unidad). **Nada de esto se ejecutó contra
  la VPS ni se reimportó a la instancia viva de n8n** — la acción inmediata trae los
  comandos exactos, listos para que el usuario los corra manualmente.
- 10-sep-2026 (mismo día, misma unidad) — a pedido del usuario, se reemplazan los
  placeholders `$POSTGRES_USER`/`$POSTGRES_DB` de los comandos por los valores reales
  (`coraje_app`, `coraje`) — un comando "listo para copiar" no debe exigir resolver una
  variable primero. Commit `6fb3bd5`.
- 10-sep-2026 (mismo día, misma unidad) — **F10 cerrado con ejecución real.** El usuario
  corre los comandos: `codigo_area` ya existía en la base viva (contradicción nombrada,
  no bloqueante); el modelo de buzón compartido se aplicó limpio (dos filas esperadas
  confirmadas, `UPDATE 1` exacto, índice creado sin violación, 0 filas ambiguas). El
  primer intento de ejecutar la ingesta en n8n repitió el error original porque se
  había publicado la copia sin el fix (`...V2.1...json`, sin commit) por confusión con
  el archivo commiteado — diagnosticado ofreciendo dos hipótesis en paralelo (archivo
  equivocado; `dim_cliente_contai` con el mismo defecto que `dim_personal`), la segunda
  descartada por consulta real (0 filas). Tras reimportar el archivo correcto
  (`e3b95a1`), la ingesta corrió de punta a punta: 2.559 → 2.825 tickets, 155 → 165
  atribuidos al marcador histórico del buzón compartido, ninguno a la ocupante actual —
  la regla dura se sostiene sobre datos nuevos, no solo sobre el caso ya conocido.
  Queda un residuo acotado (confirmar consumidor del outbox, borrar `V2`/`V2.1`) y F11
  sigue abierto, deliberadamente sin resolver en esta unidad.

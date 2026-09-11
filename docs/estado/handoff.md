# Handoff técnico

```
CORTE:   11-sep-2026 (corte 6)
HEAD:    `1e4a6a8`, publicado en `origin/main`
RAMA:    main
UNIDAD:  U2 · BASELINE CONSTRUIDO Y ADOPTADO CONTRA PRODUCCIÓN. Con el subsistema de
         identidad ya resuelto (corte 5), se escribe `schema.prisma` (14 modelos,
         `PascalCase`+`@@map`, contra el estado real de la base — no contra lo que
         declaran los `.sql` committeados) y la migración a mano
         `prisma/migrations/20260910000000_baseline/migration.sql` (~570 líneas:
         tablas, índices, FKs, `CHECK`, funciones SLA y el trigger
         `set_codigo_ticket`, copiados verbatim de la base real). Los 20 archivos de
         aplicación que llamaban a Prisma con nombres `snake_case` se migran a
         `camelCase` (el SQL crudo con `$queryRaw`/`$executeRaw` se deja intacto,
         sigue usando los nombres físicos reales). Validado en local por primera vez
         en esta unidad: FNM ya tenía Node 24.16.0 instalado, solo faltaba
         activarlo; `corepack` fija pnpm 11.2.2 exacto. `prisma generate`, `tsc
         --noEmit`, `eslint .`, `pnpm build` y `git diff --check` limpios. Publicado
         en `1e4a6a8`.

         **La migración se adopta contra producción — ejecución real confirmada
         (11-sep-2026).** `prisma migrate resolve --applied` no se pudo correr desde
         ninguna sesión de Claude Code (regla dura de `operacion.md`: no conexión
         directa a la VPS) ni dentro del propio contenedor `web` desplegado (su
         imagen final es deliberadamente mínima — sin CLI de Prisma, sin
         `schema.prisma`, sin `pnpm`, per `Dockerfile`). Se construyó solo la etapa
         intermedia `builder` del mismo `Dockerfile` (`docker build --target
         builder`, la misma etapa que ya usa Coolify en cada deploy) en una carpeta
         de trabajo aparte en la VPS, sin tocar el despliegue vivo, y se corrió
         `prisma migrate resolve --applied 20260910000000_baseline` en un
         contenedor efímero de esa imagen, unido a `coraje_net`, contra
         `coraje_postgres` real. Confirmado por consulta directa a
         `_prisma_migrations`: `finished_at` con marca de tiempo real,
         `applied_steps_count = 0` (no ejecutó un solo `CREATE TABLE` — el
         comportamiento exacto que se espera de una adopción de baseline, no de una
         migración normal), `rolled_back_at` nulo. **U2 ya no está bloqueado por
         falta de baseline: lo que queda es separar credenciales (F6) y construir el
         servicio `migrate` — ver acción inmediata.**

         **`RIESGO` nuevo, real, sin resolver: la contraseña de `coraje_app` quedó
         expuesta en texto plano en el historial de esta conversación**, pegada por
         el usuario al copiar el comando `docker run` desde la terminal SSH. Ver §6.

CORTE ANTERIOR (10-sep-2026, corte 5): investigación completa del subsistema de
         identidad no documentado, hallado al reabrir F12 contra la base real.
         `codigo_ticket` confirmado como mecanismo correcto (trigger + contador por
         área/año, guarda idempotente) — el baseline de corte 6 lo captura tal cual.
         `identidad_correo`/`resolucion_*` y cuatro columnas `*_snapshot` de
         `fact_ticket` confirmados como derivado 100% redundante de `dim_personal` —
         retirados de la base real, con lo rescatable en
         `docs/legacy/identidad-correo-2026-07.md`. Efecto colateral descubierto: el
         backfill de F10 estaba incompleto (72 filas adicionales cerradas). Verificado:
         `fact_ticket` quedó con exactamente las 18 columnas de
         `sql/db/06_helpdesk_facts.sql`. Detalle completo en §5 (F10, F12) y en el
         changelog.
STAGING: no aplica. No hay entorno de pruebas declarado para este proyecto
LINT:    ejecutado por primera vez sobre `coraje-web/` en esta unidad — ver UNIDAD
         arriba (`tsc --noEmit`, `eslint .`, `pnpm build`, todos limpios)
```

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
| Salida PostgreSQL → SharePoint | `CONSTRUIDO, ACTIVO, NUNCA EJERCITADO` | Ningún cliente radicó nunca — el outbox sigue en 0 filas (U1 §5). El workflow consumidor **existe, está commiteado y confirmado activo en n8n** (F5 cerrado), pero nadie lo ha visto procesar un ticket real todavía |
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
| ~~F11~~ | ~~`sql/elt/06_transform_ticket.sql` y el nodo `PG - Transform 06 Tickets Legacy` de n8n tenían lógica distinta para clasificar `tipo_requerimiento`/`categoria_1`/`categoria_2` legacy~~ — **cerrado 10-sep-2026 (corte 4), decisión del usuario: gana n8n.** Reconciliado: el bloque del repositorio se reemplaza por la lógica de n8n. Hallazgo real, más grave que la descripción original: la versión del repositorio no "cubría menos casos" — no cubría ninguno. Comparaba contra literales en MAYÚSCULAS que `core.norm_text()` (siempre minúsculas) nunca podía igualar, así que el bloque completo caía al `ELSE` en cualquier ejecución sobre ese archivo. La copia de n8n, la única que corre en producción, usa minúsculas y es la que clasificó correctamente los 2.825 tickets ingeridos hasta hoy. Sin cambio de comportamiento en producción — n8n ya tenía la versión correcta | ~~Media~~ | `sql/elt/06_transform_ticket.sql` vs. `n8n/CORAJE - INCREMENTAL COMPLETO...json` |
| ~~F12~~ | ~~El comentario de n8n sobre `codigo_ticket` y un subsistema de identidad sin rastro en el repositorio~~ — **cerrado de verdad, 10-sep-2026 (corte 5).** El primer cierre (corte 4) estaba mal: se apoyó solo en `git log`, nunca en la base real. Investigado a fondo: `codigo_ticket` confirmado como el mecanismo real y correcto (trigger + contador por área/año, con guarda idempotente) — el baseline lo captura tal cual. `identidad_correo`/`resolucion_*` (y, descubierto después, cuatro columnas `*_snapshot` más en `fact_ticket` con la misma data) confirmados como el mismo problema que ya resuelve `sql/elt/04_transform_personal_historico.sql`, abandonados desde jul-2026, sin nada que dim_personal no tuviera ya — retirados de la base real, con lo rescatable en `docs/legacy/identidad-correo-2026-07.md`. Efecto colateral: el backfill de F10 estaba incompleto (solo un correo de varios) — cerrado con un `UPDATE` de 72 filas. `fact_ticket` verificado con exactamente las 18 columnas de `sql/db/06_helpdesk_facts.sql` | ~~Alta~~ | `docs/legacy/identidad-correo-2026-07.md`; consultas de solo lectura contra `coraje_postgres`/`coraje`, 10-sep-2026, columnas/índices/CHECK/triggers/funciones de `core`+`helpdesk`+`staging` completas |
| ~~F5~~ | ~~El workflow de salida no está commiteado~~ — **cerrado 10-sep-2026**: commiteado con nombre correcto (`n8n/CORAJE - SALIDA - PostgreSQL to SharePoint.json`, commit `1de8641`) y **confirmado activo en la instancia viva de n8n** (el usuario lo confirmó al cerrar esta unidad). Sigue sin ejercitarse con un ticket real — el outbox tiene 0 filas (U1 §5), nadie ha radicado desde el portal todavía | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §2.2 |
| F6 | Una sola credencial de base para migrar y para servir | Media | `estado/operacion.md` |

> **Hecho nuevo para F6: la contraseña real de `coraje_app` quedó expuesta en texto
> plano en el historial de esta conversación (11-sep-2026)**, pegada al copiar un
> comando desde la terminal SSH. No es una vulnerabilidad de código — es una
> exposición operativa real de una credencial de producción. No rotarla aparte:
> hacerlo como parte del propio F6 (que de todas formas reemplaza `coraje_app` por
> `coraje_migrator`/`coraje_runtime` y toca n8n, Coolify y el `.env` de la VPS a la
> vez) evita rotarla dos veces.
| F7 | `.env.example` declara una de las cuatro variables que el código lee | Baja | Ídem |
| F8 | El SLA no se pausa, no se recalcula y no existe prioridad `ALTA` | Media | `specs/tickets.md` §5 |
| F9 | `encargado_interno` es texto libre sin clave foránea | Baja | Ídem §7.2 |

> **F12 reabierto — la consulta que se marcó "opcional, de prioridad baja" en corte 4
> era la que hacía falta correr antes de decidir, no después.** Ya se corrió, contra la
> base real, como parte del arranque de U2 (corte 5). Resultado: el mecanismo de dos
> argumentos existe y está activo, y aparece además un subsistema de identidad
> (`core.identidad_correo` y columnas asociadas de `fact_ticket`) sin rastro en todo el
> repositorio. La decisión de diseño sobre `codigo_ticket` queda sin efecto hasta
> entender ese hallazgo mayor — ver §5, fila F12, y la pregunta de procedencia hecha al
> usuario al cierre de esta entrada.

## 6. Riesgos abiertos

| Riesgo | Impacto | Control inmediato |
|---|---|---|
| Construir el ciclo del ticket sin levantar PowerApps | Rechazo de los empleados al migrar | U0, iniciado ya por su latencia |
| Crear tablas antes de decidir el modelo de esquema | Dos historias de esquema divergentes | U2 bloquea toda unidad que cree tablas |
| El equipo trabaja en la plataforma y la ingesta le borra el trabajo | Pérdida de trabajo real | U9 antes de que U7 esté en uso |
| Un cliente radica y el ticket se duplica en SharePoint | Visible para PowerApps y para el cliente | Reducido, no eliminado: el diseño del workflow ya no duplica (U1 §2, `sincronizacion-sharepoint.md` §4.2), pero sigue sin ejercitarse con un caso real — probarlo con el primer ticket real del portal antes de anunciarlo cerrado |
| La autorización destructiva alcanza datos reales | Pérdida irrecuperable | `contexto-canonico.md` §1.3 delimita el alcance |
| Se retiró el ciclo local antes de que exista el servicio `migrate` gateado que lo reemplaza | Entre esta decisión y que U2 construya ese servicio, no hay ninguna forma documentada de verificar comportamiento — ni local, ni por push | **Prerrequisito cumplido (corte 6):** el baseline ya está construido y adoptado contra producción. Falta construir el servicio `migrate` en sí — sin él, sigue sin haber gate de despliegue |
| La contraseña real de `coraje_app` se pegó en texto plano en esta conversación (11-sep-2026) | Si el historial de esta sesión queda expuesto, expone con él la credencial de base de producción | Rotar al construir F6 (separación de credenciales), actualizando n8n, `DATABASE_URL` de Coolify y el `.env` de la VPS en el mismo cambio — no rotarla dos veces |
| ~~`n8n/` tiene tres archivos sin commit~~ — **cerrado por completo 10-sep-2026**: el consumidor del outbox quedó renombrado, commiteado (`1de8641`) y confirmado activo; cuál copia de la ingesta es la real quedó confirmado por ejecución (la del archivo commiteado, `e3b95a1`, tras corregir una confusión real donde se publicó primero la copia sin fix); `V2` y `V2.1` quedaron borradas del disco de la VPS y de n8n, confirmado por el usuario | ~~Confusión futura si alguien reactivaba la copia equivocada~~ | ~~Cerrado~~ |
| El workflow de ingesta committeado embebe su propia copia de cada query SQL — **no la lee de `sql/elt/`**. **Materializado, no solo teórico:** el primer intento de correr la ingesta en esta unidad falló porque se publicó una copia de n8n sin el fix; se resolvió reimportando el archivo correcto. Ningún commit, por sí solo, cambia lo que n8n ejecuta — sigue siendo cierto para el próximo fix | Repetir el mismo incidente en la próxima corrección: escribir el fix en `sql/elt/`, olvidar reimportarlo a n8n, y que la instancia viva siga corriendo la versión vieja sin que nada lo avise | Antes de dar por aplicado cualquier cambio a `sql/elt/06_transform_ticket.sql` (o cualquier archivo que un nodo de este workflow embeba), confirmar explícitamente que se reimportó a la instancia viva — no asumir por el nombre o la fecha del archivo local; ver F11 sobre la divergencia de `tipo_legacy` entre ambas copias, que ningún reimport futuro corrige por sí solo |

## 7. Commits relevantes

| Commit | Cambio |
|---|---|
| `1e4a6a8` | **Corte vigente.** Construye el baseline Prisma: `schema.prisma` (14 modelos `PascalCase`+`@@map`), migración a mano `20260910000000_baseline`, 20 archivos de aplicación migrados a `camelCase` |
| `134663a` | Cierra F10 en la documentación con evidencia de ejecución real |
| `6fb3bd5` | Reemplaza placeholders de conexión por valores reales en los comandos entregados |
| `e3b95a1` | Construye el modelo de buzón compartido para `dim_personal` (F10) |
| `e8918e6` | Actualiza cabecera, commits y acción inmediata del handoff al estado real tras el hallazgo de F10 |
| `e2ffb24` | Retira `create-copilot-export.sh`, sin relación con HelpDesk |
| `d5efa5a` | Documenta consultas SQL directas contra la VPS y el gate de `migrate` |
| `52aed2a` | Versiona `.claude/skills/` |
| `1de8641` | Corrige Proyectos y TI como tipo, no área; añade `codigo_area`; commitea el consumidor del outbox |
| `6a54bde` | Cierre de U0/U1: decisiones de esquema, SLA, permisos ratificados, F10 descubierto |
| `6ae29e1` | Línea base documental completa |
| `a5d8347` | Estabiliza el ETL incremental SharePoint → PostgreSQL |

---

**El corte 3 quedó CERRADO (10-sep-2026).** Los cuatro pasos originales y el residuo de
n8n (consumidor del outbox activo, `V2`/`V2.1` borradas) quedaron confirmados por el
usuario, con evidencia real en cada uno — ver §4 y §5. **El corte 4 (esta unidad)
reconcilia F11** a pedido explícito del usuario, en paralelo a U2 tal como el corte 3 lo
dejó habilitado — no es una desviación de la cabeza de la cola. Al arrancar U2 (corte 5)
apareció F12 reabierto y un hallazgo mayor (subsistema de identidad no documentado,
detalle en §5) que bloqueó el baseline hasta investigarlo a fondo. **Ya resuelto:** F12
cerrado de verdad, F10 cerrado de verdad, la base real retirada de todo lo huérfano y
verificada contra `sql/db/06_helpdesk_facts.sql` columna por columna. F11 sigue cerrado
(§5); D8 sigue diferida, sin fecha asignada (`Decisiones tomadas y NO implementadas`).

**El corte 6 construye el baseline y lo adopta contra producción** (`1e4a6a8` +
`prisma migrate resolve --applied` ejecutado el 11-sep-2026, ver UNIDAD arriba). Con
esto, según `plan-ejecucion.md` U2, quedan exactamente dos escenarios mínimos sin
cerrar: **separar credenciales de migración y runtime (F6)** y **construir el
servicio `migrate` de un disparo que gatee el arranque de `web`**, igual que Impulsa.
Ninguno de los dos está construido todavía. **La acción inmediata es F6 primero**:
diseñar `coraje_migrator`/`coraje_runtime`, entregar el SQL de creación de roles
(nunca ejecutarlo directo), y de paso rotar la contraseña de `coraje_app` expuesta en
esta conversación (§6) — y solo después construir el servicio `migrate`, porque su
`Dockerfile`/compose va a depender de qué credenciales existan.

Los bloques de comando de abajo (1, 2 y 4) se dejan como referencia de lo que
efectivamente se corrió contra la base real — no son pasos pendientes.

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

**3. n8n — CERRADO por completo (10-sep-2026).** Incidencia real y resuelta: el primer
intento de ejecutar la ingesta se hizo con la copia **sin** el fix
(`CORAJE - INCREMENTAL COMPLETO V2.1 - SharePoint to PostgreSQL.json`, suelta en el
servidor, sin commit) publicada por confusión de nombre con el archivo commiteado que
sí lo trae. Al reimportar `n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to
PostgreSQL.json` (commit `e3b95a1`), la ingesta corrió sin error. El consumidor del
outbox (`CORAJE - SALIDA - PostgreSQL to SharePoint.json`, commiteado en `1de8641`)
quedó confirmado activo, y `V2`/`V2.1` quedaron borradas del servidor y de n8n —
ambas confirmadas por el usuario.

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

> **F11 (descubierto en el corte 3): cerrado en el corte 4.** La lógica de clasificación
> de `tipo_requerimiento` legacy divergía entre `sql/elt/06_transform_ticket.sql` y la
> copia embebida en n8n. Reconciliado con la lógica de n8n, por decisión del usuario —
> ver §5 para el detalle completo, incluido el hallazgo de que la versión del
> repositorio no funcionaba en absoluto (bug de mayúsculas contra `core.norm_text()`).

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
| Modelo de esquema: migraciones Prisma completas, se abandona SQL a mano (D1) | `contexto-canonico.md` §4 | **Baseline construido y adoptado contra producción (corte 6)** — falta el servicio `migrate` que automatice futuras migraciones en cada deploy |
| Consulta de tickets se acota por permiso, no queda sin restricción como en el legacy | `legacy/reglas-negocio-powerapps.md` §13.6 | Decidida, no construida |
| Se retira del runbook el ciclo de desarrollo local; la verificación funcional es siempre vía commit + push a lo desplegado | `estado/operacion.md` | Decidida, no construida — falta el servicio `migrate` que la sostenga (ver riesgo nuevo abajo) |
| Convención de nombres del modelo Prisma: `PascalCase` con `@@map` a `snake_case`, igual que Impulsa (D1') | `contexto-canonico.md` §4 | **Construida (corte 6):** las 14 tablas de `core`+`helpdesk` mapeadas en `schema.prisma`; `staging` queda deliberadamente fuera de Prisma (es dominio del ELT) |
| Observadores (watchers de solo lectura) van en v1, a partir del prototipo `helpdesk_santi/` | `specs/tickets.md` §11, `specs/permisos.md` §10 | Decidida, no construida — depende del catálogo de personas/roles todavía `ABIERTO` |
| Solicitud de validación dirigida a persona va en v1, distinta de la autorización excepcional | Ídem | Decidida, no construida — sin decidir aún si bloquea el avance del ticket |
| D8: `sql/elt/*.sql` sigue existiendo como texto de referencia legible, sin que n8n lo lea — no se construye ahora un mecanismo para que n8n consuma el archivo del repositorio (p. ej. leerlo de GitHub) en vez de su copia embebida | `docs/estado/handoff.md` §5 (F11, F12), §6 (riesgo de divergencia) | **Diferida deliberadamente (10-sep-2026):** no vale la pena esa robustez con nada más construido todavía (sin auth, sin ciclo de vida del ticket). Mitigación mientras tanto: disciplina de proceso, no de infraestructura — confirmar explícitamente el reimport a n8n en cada cambio a un archivo que un nodo embeba (regla ya en §6). Condición de revisión: si la divergencia entre `sql/elt/` y n8n se repite una tercera vez, o al llegar al final de la cola de `plan-ejecucion.md` |
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
- 10-sep-2026 (mismo día, cierre de la unidad) — el usuario confirma el residuo: el
  consumidor del outbox está activo en n8n, y `V2`/`V2.1` quedaron borradas del
  servidor y de n8n. **Unidad cerrada.** Declara explícitamente que U2 (baseline de
  migraciones Prisma) es la siguiente, en una sesión nueva — no una continuación
  inmediata. F11 queda registrado, abierto, sin fecha asignada.
- 10-sep-2026 (corte 4, sesión nueva) — el usuario abre la sesión declarando ir con U2
  pero resuelve primero F11, en paralelo, tal como el corte 3 lo dejó habilitado:
  decide que gana la lógica de n8n. Al reconciliar aparece que la versión del
  repositorio no era una cobertura parcial del mismo problema — era código muerto por
  un bug de mayúsculas contra `core.norm_text()` (siempre minúsculas), así que nunca
  reclasificó un solo ticket legacy si alguna vez se hubiera ejecutado en vez de la
  copia de n8n. Se reconcilia `sql/elt/06_transform_ticket.sql` con la lógica de n8n,
  sin tocar la copia de n8n (ya correcta) ni la base real. Aparece un segundo hallazgo,
  sin resolver (F12): el comentario de n8n sobre generación de `codigo_ticket` describe
  un trigger y una función de dos argumentos que no existen en `sql/db/`. El usuario
  también pregunta si vale la pena seguir manteniendo `sql/elt/*.sql` dado que n8n no
  lo lee — queda registrado como D8, sin resolver. Cambios sin commit al cierre de esta
  entrada.
- 10-sep-2026 (corte 4, misma sesión) — se investiga F12 por lectura de código:
  `git log -p` sobre `sql/db/02_functions.sql` muestra que `next_codigo_ticket()` nunca
  tuvo, en ningún commit, una versión de dos argumentos, y no existe ningún
  `CREATE TRIGGER` en `sql/`. La hipótesis más probable pasa a ser documentación
  obsoleta de n8n, no drift de esquema — pendiente de confirmar con una consulta de
  solo lectura contra la base real (comando en §5). Aparece un hallazgo colateral real:
  `next_codigo_ticket()` usa la fecha del servidor, no `fecha_creacion` del ticket, así
  que todo ticket legacy migrado quedó con el año de su corrida de ingesta en vez de su
  año histórico — probablemente el motivo real detrás del comentario de n8n. El usuario
  decide diferir D8 (que n8n lea `sql/elt/` de GitHub en vez de embeber su copia):
  no vale la pena esa robustez con nada más construido todavía; la mitigación mientras
  tanto es la disciplina de reimport manual ya documentada en §6. D8 se mueve a
  `Decisiones tomadas y NO implementadas` como diferida, con condición explícita de
  revisión. Se publican dos commits (`e14e0c6` fix de F11, `83ecc54` cierre documental
  de F11/F12/D8) y se hace push a `origin/main`.
- 10-sep-2026 (corte 4, misma sesión, tras el push) — el usuario ratifica el formato
  simple de `codigo_ticket` como el correcto. F12 pasa de "investigado, pendiente de
  verificación" a **cerrado con decisión de diseño**: la alternativa por área queda
  descartada, no solo diferida, porque tenía un defecto propio (inestabilidad ante
  reasignación de área) además de no resolver de raíz que la secuencia ya no se
  reinicia por año. La consulta de solo lectura contra la base real queda como residuo
  opcional, sin bloquear el cierre. Cambios sin commit al cierre de esta entrada.
- 10-sep-2026 (corte 5, sesión nueva) — el usuario pide arrancar U2 sin más demora. Antes
  de escribir el baseline, se pide la consulta de solo lectura contra la base real que
  corte 4 había dejado como "residuo opcional" (columnas de `dim_area`/`dim_personal`,
  todos los índices, todos los CHECK, todos los triggers y todas las tablas de `core`,
  `helpdesk` y `staging`). El resultado retracta el cierre de F12: `next_codigo_ticket`
  sí tiene dos argumentos y hay un trigger activo (`trg_set_codigo_ticket`) — el
  mecanismo que se declaró "nunca construido" corre en producción. Peor: la misma
  consulta revela `core.identidad_correo`, columnas nuevas en `fact_ticket`
  (`id_identidad_correo_asignado/solicitante`, `resolucion_asignado/solicitante`), un
  `chk_fact_ticket_origen_exclusivo` reescrito, un `chk_fact_ticket_evento_tipo` más
  angosto y ninguno de los índices de `fact_ticket` que declara el repositorio —
  reemplazados por otros dos. Se busca en todo el repositorio, incluido `n8n/`: no hay
  ni un rastro. U2 se bloquea por completo hasta que el usuario explique la procedencia
  de ese subsistema. Cambios sin commit al cierre de esta entrada.
- 10-sep-2026 (corte 5, mismo día, cierre) — el usuario admite no recordar el origen y
  pide investigarlo con datos en vez de memoria. El cruce de `resolucion_asignado`
  contra el marcador de F10 confirma que `LEGACY_INFERRED_PERSON` es el mismo problema
  que resuelve `sql/elt/04_transform_personal_historico.sql`, no un mecanismo distinto
  — y revela que el backfill de F10 (corte 3) solo había marcado un correo de varios
  con el mismo patrón; se cierra con un `UPDATE` de 72 filas. El usuario decide: F10 se
  queda, `identidad_correo` se retira, con lo rescatable (9 buzones funcionales
  clasificados a mano, tres ideas para el futuro) preservado en
  `docs/legacy/identidad-correo-2026-07.md` antes de borrar. La verificación del primer
  retiro destapa un segundo grupo de columnas huérfanas en `fact_ticket`
  (`*_snapshot`, `fecha_redireccion`) que ninguna inspección anterior había visto — se
  retiran en la misma pasada. `fact_ticket` queda verificado con exactamente las 18
  columnas de `sql/db/06_helpdesk_facts.sql`. **F10 y F12 cerrados de verdad. La acción
  inmediata vuelve a ser U2: escribir `schema.prisma` y la migración baseline**, ahora
  sobre un esquema completamente inventariado. Cambios de esta entrada sin commit al
  cierre.
- 11-sep-2026 (corte 6) — se escribe `schema.prisma` (14 modelos) y la migración a mano
  `20260910000000_baseline/migration.sql` sobre el esquema ya inventariado; se
  descubre y corrige la cascada de 20 archivos de aplicación que llamaban a Prisma en
  `snake_case`. Verificado en local por primera vez en el proyecto: FNM ya tenía Node
  24.16.0 instalado (solo faltaba activarlo), `corepack` fija pnpm 11.2.2, y
  `prisma generate`/`tsc --noEmit`/`eslint .`/`pnpm build`/`git diff --check` quedan
  limpios. Publicado en `1e4a6a8`. El usuario corrige una suposición de secuencia:
  construir el servicio `migrate` **antes** de adoptar la baseline habría roto el
  siguiente deploy — `migrate deploy` habría intentado ejecutar el DDL de la baseline
  contra tablas que ya existen (`CREATE TABLE` sin `IF NOT EXISTS`, fallo inmediato,
  `web` nunca arranca por el `depends_on: service_completed_successfully`). Se
  ejecuta primero, manualmente, el flujo oficial de Prisma para adoptar una base
  preexistente: el usuario construye solo la etapa `builder` del `Dockerfile` de
  producción en una carpeta aparte en la VPS (`docker build --target builder`) y
  corre `prisma migrate resolve --applied 20260910000000_baseline` en un contenedor
  efímero de esa imagen, unido a `coraje_net`, contra `coraje_postgres` real —
  confirmado en `_prisma_migrations` con `applied_steps_count = 0` (no ejecutó DDL,
  exactamente lo esperado de una adopción de baseline). **Incidencia real: la
  contraseña de `coraje_app` quedó pegada en texto plano en el chat** al copiar el
  comando `docker run` desde la terminal SSH — registrada como riesgo nuevo en §6,
  con recomendación de rotarla junto con F6 en vez de aparte. U2 queda con dos
  escenarios mínimos pendientes: separar credenciales (F6) y construir el servicio
  `migrate`. Nueva acción inmediata: F6 primero (bloquea el diseño del servicio
  `migrate`, que depende de qué credenciales existan).

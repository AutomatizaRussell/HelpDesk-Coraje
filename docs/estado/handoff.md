# Handoff técnico

```
CORTE:   10-sep-2026 (corte 2)
HEAD:    e2ffb24. Publicado en origin/main
RAMA:    main
UNIDAD:  CIERRE DE U0/U1 + INVESTIGACIÓN DE INGESTA. Se resolvieron cuatro de cinco
         preguntas de U0 por confirmación directa del usuario (sin levantamiento
         formal de PowerApps) y las cinco de U1 con evidencia real contra la VPS y
         contra el contenido de n8n/. Se decidió el modelo de esquema (Prisma
         completo, D1/D1'). Ejecutando manualmente la ingesta corregida (V2.1) se
         encontró y se corrigió un bug real (Proyectos y TI tratada como área propia)
         y se descubrió un bloqueo nuevo, no resuelto: `core.dim_personal` tiene una
         fila duplicada por correo (buzón compartido), con 155 tickets reales
         dependiendo de ella. CONSECUENCIA DECLARADA: el código de ingesta ya está
         corregido y publicado, pero **no se ha ejecutado con éxito contra la base
         real todavía** — ni la columna `codigo_area` ni el modelo de buzón
         compartido existen en la base viva, solo en el código.
STAGING: no aplica. No hay entorno de pruebas declarado para este proyecto
LINT:    no ejecutado sobre `coraje-web/`. Se tocó SQL y workflows de n8n, no
         TypeScript
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
| Ingesta SharePoint → PostgreSQL | `EJERCITADO` | 2.313 tickets conciliados en `legacy/baseline-calidad.md` — **contradicho por consulta real del 10-sep-2026: 2.559 tickets hoy** (§4). No se resuelve en silencio: ver nota |
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

**Comprobado en entorno real:** las tres consultas SQL de U1, 10-sep-2026, contra
`coraje_postgres`/`coraje` en la VPS de producción. El contenido real de
`n8n/REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json`, leído esa misma
fecha: es el consumidor del outbox, mal nombrado.

**No conocido:** si el despliegue en Coolify está activo más allá de que la base
responda; el comportamiento funcional de PowerApps; si el workflow que el archivo
describe es efectivamente el que está `active` en la instancia real de n8n hoy — el
archivo dice que sí, pero un archivo exportado no es la instancia viva.

## 5. Fallos abiertos

| # | Fallo | Severidad | Dónde |
|---|---|---|---|
| F1 | El portal permite operar a nombre de cualquier cliente sin credencial | **Alta** | `specs/acceso-clientes.md` §1 |
| F2 | La redirección usa contraseña compartida; no hay traza de quién redirigió | **Alta** | `specs/acceso-empleados.md` §1 |
| F3 | El ELT sobrescribe todos los campos con SharePoint y pierde la procedencia del portal | **Alta** | `specs/sincronizacion-sharepoint.md` §4.1 |
| ~~F4~~ | ~~Posible duplicado por eco~~ — **cerrado 10-sep-2026**: el workflow sí escribe la referencia legacy antes de marcar `SENT`. Resuelto en diseño; sigue sin ejercitarse con un ticket real | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §4.2 |
| F10 | `core.dim_personal` tiene **al menos dos filas con el mismo `correo_corporativo`** (`recepcion.gct@rbcol.co` — confirmado el único caso hoy, `HAVING count(*) > 1` no devuelve otro). Cualquier ticket legacy asignado a ese correo compartido duplica filas en el `JOIN` de `06_transform_ticket` y aborta con `ON CONFLICT ... cannot affect row a second time`. **155 tickets reales** en `fact_ticket` referencian directamente la fila fantasma (`ef1e69e7...`). Dirección de solución decidida (modelo de buzón compartido, `specs/tickets.md` §7.3) — **diseño exacto sin construir todavía. Sigue bloqueando cualquier ejecución real de la ingesta** | **Alta — bloqueante hoy** | `core.dim_personal`; `specs/tickets.md` §7.3 |
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
| `n8n/` tiene tres archivos sin commit: el consumidor real del outbox (mal nombrado, F5) y dos copias inactivas de la ingesta (`V2`, `V2.1`, cada una con `id` de workflow distinto — no son historial secuencial de una misma entidad) | Pérdida silenciosa del consumidor si alguien limpia la carpeta; confusión sobre cuál ingesta es la real si alguien activa la copia equivocada | Renombrar y commitear el consumidor ya; confirmar en la instancia viva de n8n cuál de las tres ingestas está `active` antes de borrar las otras dos — el archivo sin sufijo es el único con commit y el único `active: true` en su export, pero un export no es la instancia viva |

## 7. Commits relevantes

| Commit | Cambio |
|---|---|
| `e2ffb24` | **Corte vigente.** Retira `create-copilot-export.sh`, sin relación con HelpDesk |
| `d5efa5a` | Documenta consultas SQL directas contra la VPS y el gate de `migrate` |
| `52aed2a` | Versiona `.claude/skills/` |
| `1de8641` | Corrige Proyectos y TI como tipo, no área; añade `codigo_area`; commitea el consumidor del outbox |
| `6a54bde` | Cierre de U0/U1: decisiones de esquema, SLA, permisos ratificados, F10 descubierto |
| `6ae29e1` | Línea base documental completa |
| `a5d8347` | Estabiliza el ETL incremental SharePoint → PostgreSQL |

---

## ACCIÓN INMEDIATA

**U1 y la publicación están cerrados.** Lo que sigue no es U2 todavía — es hacer que el
código ya corregido y publicado (commit `1de8641`) funcione contra la base real, algo
que hoy **no se ha probado ni una vez**:

1. **Aplicar `codigo_area` a la base real de la VPS.** `sql/db/04_core.sql` ya declara
   la columna; nadie ha corrido el `ALTER TABLE` contra `core.dim_area` en producción
   — el esquema sigue siendo SQL a mano, aplicado a mano (`contexto-canonico.md` §4).
   Sin esto, el primer paso de la ingesta corregida falla igual que fallaba antes.
2. **Diseñar y construir el modelo de buzón compartido (F10, `specs/tickets.md`
   §7.3).** Ya no es un hallazgo aparte: es lo que bloquea que la transformación de
   tickets corra hasta el final. Regla dura ya decidida: los 155 tickets afectados
   **nunca** quedan a nombre de quien ocupa el buzón hoy.
3. **Confirmar en la instancia viva de n8n** cuál workflow queda activo — de las tres
   versiones de `CORAJE - INCREMENTAL COMPLETO` que existieron, solo una debe seguir
   viva, y debe ser la que corresponde al código ya corregido — y activar el consumidor
   del outbox (`CORAJE - SALIDA...`, commiteado, nunca activado).
4. **Solo entonces**, ejecutar la ingesta real de punta a punta y confirmar si el
   conteo de tickets cambia.

`core.dim_personal` y `core.dim_area` son exactamente las tablas que U2 va a migrar a
Prisma — conviene resolver 1–4 primero y no en paralelo con el baseline de U2, para no
construir dos veces el mismo tramo de esquema.

> **En paralelo, y no después: U0**, el levantamiento funcional de PowerApps. Su cuello
> de botella es la disponibilidad de otras personas, no el trabajo, así que empezarlo
> tarde retrasa todo lo demás. Es la única excepción declarada a la regla de una sola
> unidad a la vez.

> **Antes de cualquier otra cosa, publicar este corte.** El trabajo está sin commit y un
> conjunto documental sin publicar no es la fuente de verdad de nadie.

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
| Modelo de buzón compartido (F10): se construye una dimensión con vigencia en el tiempo, no una fusión hacia el ocupante actual. **Bajo ninguna circunstancia** los 155 tickets históricos quedan a nombre de Eilyn (la ocupante actual) — mientras no se recupere el nombre real de quien atendía el buzón en su momento, usan un marcador explícito de "responsable histórico no identificado" | `specs/tickets.md` §7.3 | Decidida (dirección), no construida — el diseño exacto (rangos de vigencia, convención del marcador) sigue sin resolver, ver §7.3 |

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

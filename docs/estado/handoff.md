# Handoff técnico

```
CORTE:   03-sep-2026 (corte 1)
HEAD:    a5d8347. SIN COMMIT — todo el trabajo de este corte está en el árbol de
         trabajo, sin publicar
RAMA:    main
UNIDAD:  LÍNEA BASE DOCUMENTAL. No existía contrato documental adaptado a lo que el
         proyecto va a ser: había ocho documentos sueltos que describían una migración
         one-way desde SharePoint, escritos antes de que el HelpDesk completo entrara
         en alcance y antes de que existieran las referencias de `plataforma-impulsa`.
         Se escribe el conjunto completo —`CLAUDE.md`, índice, contexto canónico, cinco
         specs, sistema de diseño y tres documentos de estado— adaptando estructura,
         precedencia y convenciones del proyecto hermano. Se preserva la evidencia
         empírica del legacy en `docs/legacy/` y se retiran cuatro documentos de
         intención superados. CONSECUENCIA DECLARADA: casi todo el conjunto es
         contrato acordado, NO comportamiento observado. Verificado por lectura directa
         del árbol; SIN EJERCITAR, SIN DESPLEGAR, SIN COMMIT.
STAGING: no aplica. No hay entorno de pruebas declarado para este proyecto
LINT:    no ejecutado. La unidad no tocó una sola línea de código
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
| Ingesta SharePoint → PostgreSQL | `EJERCITADO` | 2.313 tickets y 439 eventos conciliados (`legacy/baseline-calidad.md`) |
| Salida PostgreSQL → SharePoint | `CONSTRUIDO, NUNCA EJERCITADO` | Ningún cliente radicó nunca. El workflow consumidor no está versionado |
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
| `legacy/baseline-calidad.md` | Que la carga inicial cuadró en su momento | Que siga cuadrando hoy |

**Comprobado en entorno real:** nada en este corte.

**No conocido:** el estado de cualquier servidor, contenedor o instancia de n8n; el
contenido actual de la base; si el despliegue en Coolify está activo; el comportamiento
funcional de PowerApps.

## 5. Fallos abiertos

| # | Fallo | Severidad | Dónde |
|---|---|---|---|
| F1 | El portal permite operar a nombre de cualquier cliente sin credencial | **Alta** | `specs/acceso-clientes.md` §1 |
| F2 | La redirección usa contraseña compartida; no hay traza de quién redirigió | **Alta** | `specs/acceso-empleados.md` §1 |
| F3 | El ELT sobrescribe todos los campos con SharePoint y pierde la procedencia del portal | **Alta** | `specs/sincronizacion-sharepoint.md` §4.1 |
| F4 | Posible duplicado por eco: no consta que el workflow de salida escriba la referencia legacy | **Alta, no confirmada** | Ídem §4.2 |
| F5 | El workflow de salida no está versionado en `n8n/` | Media | Ídem §2.2 |
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
| Un cliente radica y el ticket se duplica en SharePoint | Visible para PowerApps y para el cliente | U1 §2 antes de habilitar el portal |
| La autorización destructiva alcanza datos reales | Pérdida irrecuperable | `contexto-canonico.md` §1.3 delimita el alcance |

## 7. Commits relevantes

| Commit | Cambio |
|---|---|
| `a5d8347` | **Corte vigente.** Estabiliza el ETL incremental SharePoint → PostgreSQL |
| `139f24b` | Prepara Coraje Web con Docker Compose y red dedicada |
| `bd801e1` | Portal cliente, redirección interna y outbox a SharePoint |

**Esta unidad no tiene commit todavía.**

---

## ACCIÓN INMEDIATA

**U1 — responder las cinco preguntas de `estado/plan-ejecucion.md`, sin construir nada.**

Dos consultas a la base (cobertura del directorio; estados, prioridades y outbox reales)
y tres comprobaciones en la instancia de n8n (¿el workflow de salida escribe la
referencia legacy?, ¿hay cron de respaldo?, ¿hay workflow de error?).

Se elige esta y no otra porque **es ejecutable hoy, sin depender de nadie, y sus cinco
respuestas desbloquean cuatro decisiones distintas**. Cualquier construcción que empiece
antes se apoya en supuestos.

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

## Decisiones que faltan y bloquean

| # | Decisión | Bloquea | Quién decide |
|---|---|---|---|
| D1 | Modelo de esquema: SQL a mano o migraciones Prisma | Toda tabla nueva | Usuario |
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

**Changelog:** 03-sep-2026 — línea base del handoff. Primer corte: conjunto documental
completo escrito y evidencia legacy reubicada, sin una línea de código tocada y sin
publicar.

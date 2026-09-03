# Ciclo de vida del ticket

```
ESTADO:      parcial — existe el modelo de datos y está poblado con 2.313 tickets
             reales; NO existe el ciclo de vida. El único tránsito implementado es
             crear y redirigir. Este documento propone el contrato objetivo y nombra
             lo que el esquema actual no puede sostener
CORTE:       03-sep-2026
EVIDENCIA:   lectura directa de `sql/db/06_helpdesk_facts.sql`, `sql/db/07_seed.sql` y
             `coraje-web/prisma/schema.prisma` en este corte. Los conteos vienen de
             `docs/legacy/baseline-calidad.md`, conciliados en su momento
BLOQUEO:     el comportamiento funcional real vive en PowerApps y NO está documentado
             en ninguna parte (§2)
```

**Autoridad:** este documento es propietario del ciclo de vida del ticket, su
vocabulario de estados y su registro de eventos. El acceso externo vive en
`specs/acceso-clientes.md`; la salida hacia SharePoint, en
`specs/sincronizacion-sharepoint.md`; los permisos, en `specs/permisos.md`.

## 1. Qué existe hoy, verificado

| Pieza | Estado real |
|---|---|
| `helpdesk.fact_ticket` | Existe, poblada, con `CHECK` de origen, fechas y calificación |
| `helpdesk.fact_ticket_evento` | Existe, con seis tipos de evento y `event_hash` para idempotencia |
| `helpdesk.dim_estado` | Existe, **con tres filas**: `ABIERTO`, `CERRADO`, `RECHAZADO` |
| `helpdesk.dim_prioridad` | Existe, **con dos filas**: `BAJA` (5 días) y `MEDIA` (3 días) |
| `helpdesk.routing_rule` | Existe: resuelve encargado por tipo de requerimiento |
| `core.add_colombia_business_days` | Existe: calendario hábil colombiano para el SLA |
| Crear ticket desde el portal | Implementado. Fuerza `MEDIA`, `ABIERTO`, sin área ni tipo |
| Redirigir a un área | Implementado. Asigna área, tipo y encargado, y encola la salida |
| **Todo lo demás del ciclo** | **No existe.** Ni asignar, ni responder, ni cerrar, ni rechazar |

## 2. `RIESGO` El bloqueo mayor del proyecto

**El comportamiento funcional de la mesa de ayuda vive en una aplicación de PowerApps
que no está en este repositorio, que nadie ha documentado y que este contrato no ha
visto.** Todo lo que sigue está inferido del esquema de datos y de las reglas de
clasificación legacy, no del sistema que las personas usan hoy.

Lo que el esquema **no** puede decirnos, y hace falta saber antes de construir:

- Qué transiciones existen de verdad y quién puede ejecutarlas.
- Qué pasa cuando el agente necesita algo del cliente: si el ticket cambia de estado,
  si el reloj del SLA se detiene, si el cliente recibe aviso.
- Si un ticket se reasigna entre áreas y con qué reglas.
- Cómo se cierra: si el cliente confirma, si se cierra solo tras un plazo, si hay
  reapertura.
- Qué significan de verdad `respuesta_final` y `calificacion`, que existen en la tabla
  sin ningún flujo que las escriba.

> **Consecuencia declarada.** Construir el HelpDesk sin este levantamiento es diseñar
> por analogía con mesas de ayuda genéricas y descubrir las reglas reales cuando los
> empleados se nieguen a migrar. El levantamiento no es documentación: es el insumo del
> diseño, y es **anterior** a decidir el vocabulario de estados de §4.

## 3. Decisión central

**Todo cambio de estado nace como evento, y el estado del ticket es una proyección de
esos eventos escrita en la misma transacción.**

Es el patrón que Impulsa adoptó tras encontrarse con tres tablas contestando «qué le
pasó a esto» y contradiciéndose. Tres reglas duras, tomadas literalmente de allí:

1. **Solo `INSERT`.** Nunca `UPDATE`, nunca `DELETE` sobre el registro de eventos.
   Corregir una decisión es un evento nuevo, no la mutación del anterior.
2. **No existe camino que cambie estado sin escribir el hecho.** Se materializa en un
   **escritor único**: una función por la que pasa todo cambio, no dieciocho sitios
   escribiendo el log a mano.
3. **El evento y la proyección se escriben en la misma transacción.** Si una falla,
   fallan las dos.

**Por qué proyección y no derivación en tiempo de lectura:** el estado se consulta y se
filtra constantemente —bandejas, tableros, SLA vencidos— y recalcularlo desde el log en
cada consulta convierte cada listado en una agregación. La proyección es un caché con
integridad transaccional, no una segunda fuente de verdad: si diverge, es un defecto, y
el log manda.

## 4. Vocabulario de estados

> **`ABIERTO`, bloqueado por §2.** Lo que sigue es la propuesta mínima que el dominio
> exige, no una decisión. Se ratifica contra el levantamiento de PowerApps.

Los tres estados actuales **no alcanzan** para operar una mesa de ayuda. Con
`ABIERTO / CERRADO / RECHAZADO` no se puede distinguir un ticket que nadie ha mirado de
uno que alguien está atendiendo, ni representar la espera de una respuesta del cliente.
Faltan, como mínimo:

| Estado propuesto | Significado | Por qué es necesario |
|---|---|---|
| `ABIERTO` | Radicado, sin área ni responsable | Ya existe |
| `ASIGNADO` | Tiene área y responsable; nadie ha empezado | Separa la cola de reparto del trabajo real |
| `EN_PROCESO` | Alguien lo está atendiendo | Sin él, «abierto» mezcla lo abandonado con lo activo |
| `ESPERANDO_CLIENTE` | Falta información del cliente | **Es el que detiene el reloj del SLA** (§5) |
| `RESUELTO` | Hay respuesta; falta confirmación o plazo | Permite reapertura sin resucitar un cerrado |
| `CERRADO` | Terminal por confirmación o por plazo | Ya existe |
| `RECHAZADO` | Terminal sin atención, con motivo | Ya existe |

**Un solo vocabulario para la vista interna y para el portal del cliente.** Vocabularios
paralelos son la forma en que dos vistas divergen sin que nadie lo note. Si un estado
necesita un rótulo distinto de cara al cliente, es una traducción de presentación, no
otro estado.

> **`DECISIÓN` obligada al ampliar.** `dim_estado` es una tabla de catálogo, no un
> `enum`, así que añadir estados es un `INSERT` — barato y sin migración de tipo. El
> costo real está en otra parte: cada estado nuevo tiene que tener **una transición que
> lo alcance, una que lo abandone y un permiso que lo autorice**, o se convierte en un
> estado en el que los tickets entran y se quedan.

## 5. SLA

`fecha_limite` se calcula al crear, sumando `dias_sla` de la prioridad en **días hábiles
colombianos** mediante `core.add_colombia_business_days`. Esa parte está bien resuelta y
se conserva.

Tres defectos del modelo actual, ninguno hipotético:

| # | Defecto | Consecuencia |
|---|---|---|
| 1 | El reloj **no se detiene nunca** | Un ticket esperando tres días al cliente incumple el SLA por culpa del cliente. La métrica deja de medir a la firma |
| 2 | `fecha_limite` **no se recalcula** al cambiar la prioridad | Subir un ticket a prioridad alta no adelanta su vencimiento |
| 3 | **No existe prioridad `ALTA`** | El catálogo tiene `BAJA` y `MEDIA`. La creación desde el portal fuerza `MEDIA` para todo |

> **`INVARIANTE` propuesto.** El tiempo en `ESPERANDO_CLIENTE` no consume SLA. Eso exige
> registrar el tiempo acumulado en espera, no solo la fecha límite: un solo campo de
> vencimiento no puede representar un reloj que se pausa. Es una columna nueva, y hay
> que decidirla al mismo tiempo que el estado, no después.

**Los escalados y avisos por SLA son consultas contra PostgreSQL disparadas por un
scheduler.** La ventana se cierra sola y el tiempo no llama a nadie, así que n8n aporta
un golpe periódico que pregunta; la regla vive en la base. n8n **no** decide qué está
vencido.

## 6. Registro de eventos: lo que le falta al modelo actual

`fact_ticket_evento` tiene seis tipos —`CREACION`, `COMENTARIO`, `REASIGNACION`,
`CAMBIO_ESTADO`, `CANCELACION_CLIENTE`, `MIGRACION_LEGACY`— y `event_hash` para
idempotencia del ETL, que es un acierto y se conserva.

Le faltan tres campos, y cada ausencia bloquea una capacidad concreta:

| Campo ausente | Qué impide hoy |
|---|---|
| **`visibilidad`** (`INTERNO` / `CLIENTE` / `AMBOS`) | No se puede distinguir una nota interna de una respuesta al cliente. O el portal muestra todo, o no muestra nada |
| **`estado_anterior` / `estado_nuevo`** | Existe el tipo `CAMBIO_ESTADO`, pero el cambio va en texto libre. La historia de estados **no es reconstruible** |
| **`actor` externo** | `id_autor` referencia `core.dim_personal`: solo empleados. Un evento producido por el cliente no tiene dónde atribuirse |

`visibilidad` es la pieza que evita construir un segundo modelo de datos: **una sola
tabla, dos proyecciones por filtro.** El equipo ve `INTERNO` y `AMBOS`; el cliente,
`CLIENTE` y `AMBOS`. Es exactamente la nota interna frente a la respuesta pública, sin
duplicar nada.

> El tipo de evento es `VARCHAR(50)` con un `CHECK` de lista cerrada. Funciona, pero un
> valor nuevo exige alterar el constraint. Si el modelo de esquema pasa a migraciones
> Prisma (`contexto-canonico.md` §4), este es un candidato natural a `enum` — con la
> precaución conocida: `ALTER TYPE … ADD VALUE` **debe ir sola en su propio archivo de
> migración**, porque Prisma envuelve cada archivo en una transacción.

## 7. `RIESGO` Dos restricciones del esquema que hay que revisar antes de construir

**7.1 Origen exclusivo.** `chk_fact_ticket_origen_exclusivo` exige que un ticket tenga
cliente **o** solicitante interno, nunca ambos. Eso impide representar el caso más común
de una mesa de ayuda: **un empleado radica en nombre de un cliente** que llamó por
teléfono o escribió por correo. Con la restricción vigente hay que elegir entre perder
al cliente o perder a quien lo radicó.

**7.2 `encargado_interno` es texto libre.** Tanto en `fact_ticket` como en
`routing_rule`, la persona responsable es una cadena sin clave foránea a
`core.dim_personal`. No hay integridad: un nombre mal escrito produce un responsable que
no existe, y no se puede consultar «qué tiene asignado esta persona» de forma fiable.
Viene de la forma del dato en SharePoint, y es deuda heredada, no una decisión.

## 8. Criterios de aceptación

- Ningún camino cambia el estado de un ticket sin escribir su evento, y **existe prueba
  negativa** de que un cambio directo falla.
- El evento y la proyección se escriben en la misma transacción; si una falla, ninguna
  persiste.
- La historia completa de estados de un ticket es **reconstruible** desde los eventos.
- Un evento interno **nunca** aparece en el portal del cliente, con prueba negativa.
- El vocabulario de estados es **uno solo**; una prueba verifica que no exista una
  segunda lista.
- Reintentar la ingesta legacy **no duplica** eventos: `event_hash` lo impide.
- El tiempo en espera del cliente **no** consume SLA.
- Un ticket no puede quedar en un estado sin transición de salida.

## 9. Orden de implementación

| # | Entrega | Depende de |
|---|---|---|
| 1 | **Levantamiento funcional de PowerApps** (§2) | Nadie más puede hacerlo |
| 2 | Ratificar vocabulario de estados y transiciones | 1 |
| 3 | Campos que faltan en el evento (§6) y decisión de esquema | 2 |
| 4 | Escritor único de eventos con proyección transaccional | 3 |
| 5 | Bandeja interna, asignación y respuesta | 4, `specs/permisos.md` |
| 6 | Reloj de SLA con pausa y escalado | 4 |
| 7 | Vista del ticket en el portal del cliente | 4, `specs/acceso-clientes.md` |

---

## 10. Verificación contra código

| # | Afirmación a verificar | Dónde comprobarlo | Veredicto |
|---|---|---|---|
| V1 | `dim_estado` tiene exactamente tres filas | `sql/db/07_seed.sql` | **Verificado** 03-sep-2026 |
| V2 | `dim_prioridad` no tiene `ALTA` | `sql/db/07_seed.sql` | **Verificado** 03-sep-2026 |
| V3 | Los seis tipos de evento y su `CHECK` | `sql/db/06_helpdesk_facts.sql` | **Verificado** 03-sep-2026 |
| V4 | `fact_ticket_evento` no tiene visibilidad ni estados anterior/nuevo | Ídem | **Verificado** 03-sep-2026 |
| V5 | `id_autor` solo referencia `core.dim_personal` | Ídem | **Verificado** 03-sep-2026 |
| V6 | El `CHECK` de origen exclusivo impide cliente y solicitante juntos | Ídem | **Verificado** 03-sep-2026 |
| V7 | `encargado_interno` no tiene clave foránea | Ídem y `schema.prisma` | **Verificado** 03-sep-2026 |
| V8 | El SLA se calcula al crear y no se recalcula ni se pausa | `src/app/portal/tickets/nuevo/actions.ts` | **Verificado** 03-sep-2026 |
| V9 | Estados reales usados por los 2.313 tickets migrados | Consulta a `helpdesk.fact_ticket` agrupando por estado | **Sin verificar** — requiere base |
| V10 | Distribución real de prioridades en los datos migrados | Ídem | **Sin verificar** — requiere base |
| V11 | Cuántos eventos legacy quedarían como `INTERNO` al añadir visibilidad | Consulta por `tipo_evento` | **Sin verificar** — decide el valor por defecto de la migración |

> **Lectura del conjunto.** Ocho de once afirmaciones están verificadas contra el árbol,
> y todas confirman deuda, no capacidades. Las tres que faltan requieren consultar la
> base y son exactamente las que fijan el alcance de la migración de datos: **el diseño
> del modelo de eventos no debería cerrarse sin ellas.**

**Changelog:** 03-sep-2026 — línea base. Declara el bloqueo por ausencia de
levantamiento de PowerApps (§2); adopta el modelo de estado derivado de eventos con
escritor único (§3); propone el vocabulario mínimo de siete estados contra los tres
existentes (§4); registra los tres defectos del SLA (§5), los tres campos ausentes del
evento (§6) y las dos restricciones de esquema a revisar (§7).

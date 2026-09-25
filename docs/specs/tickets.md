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
| `helpdesk.fact_ticket_evento` | Existe, con cuatro tipos de evento (V3) y `event_hash` para idempotencia |
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

> **`SUPOSICIÓN` explícita (24-sep-2026) — U0, pregunta 3, sin respuesta.** De las cinco
> preguntas de U0, cuatro se cerraron el 03-sep-2026 (`estado/handoff.md`). La tercera
> quedó aplazada y **su texto no quedó registrado en ningún documento ni en el
> historial de git**: se formuló en conversación. Por eliminación frente a la lista de
> arriba, trataba de una de dos cosas: las transiciones y la reasignación entre áreas, o
> el significado de `respuesta_final` y `calificacion`. Las dos afectan a §4 y §6.
>
> **Se decide no esperarla.** El modelo de eventos se construye suponiendo que el
> legacy **no tiene más reglas que las leídas** en `legacy/reglas-negocio-powerapps.md`
> §2 y §6–§8, y que lo que haya que añadir después será una transición, un tipo de
> evento o un permiso nuevo: un cambio que se suma al catálogo, no la reescritura de lo
> construido. Si aparece una regla que invalide esta suposición, se registra aquí con
> fecha y se decide en ese momento, no se absorbe en silencio.

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

### 3.1 `DECISIÓN` (24-sep-2026) Dónde se hace cumplir, y la ingesta legacy

**El escritor único vive en PostgreSQL, no en la aplicación.** Es una función
`SECURITY DEFINER` que escribe el evento y la proyección en la misma transacción. A
`coraje_runtime` y a `coraje_etl` se les retira el privilegio de `UPDATE` sobre la
columna `id_estado` de `helpdesk.fact_ticket`. Un `UPDATE` directo con cualquiera de los
dos roles falla con *permission denied*: esa es la prueba negativa de §8, y se ejercita
contra la base desplegada.

**Por qué no como Impulsa.** Impulsa sostiene su escritor único
(`src/server/revision/review-event.service.ts`) con código TypeScript y pruebas que
leen el código fuente. Le basta porque todo lo que escribe pasa por su aplicación. Aquí
existe un segundo escritor, la ingesta SQL que corre desde n8n con `coraje_etl`, y
ninguna prueba sobre `src/` lo ve.

**La ingesta legacy también escribe el evento.** Hoy la transformación 06 (nodo
`PG - Transform 06 Tickets Legacy` del workflow de ingesta en `n8n/`) sobrescribe
`id_estado` en cada ejecución y en cada ticket, cambie o no, y la 07 solo produce
`COMENTARIO`. Con
esta decisión la ingesta solo toca el estado cuando cambia, y lo hace a través del
escritor único. **Qué sistema gana cuando SharePoint y la plataforma no coinciden sigue
siendo U9** (`specs/sincronizacion-sharepoint.md` §4.1). Esto solo fija que ningún
cambio de estado queda sin su evento, venga de donde venga.

**El registro de eventos también se protege por privilegios** (decidido el 25-sep-2026).
A `coraje_runtime` y a `coraje_etl` se les retira `UPDATE` y `DELETE` sobre
`helpdesk.fact_ticket_evento`, con prueba negativa contra la base desplegada. Es la
regla 1 de §3 hecha cumplir por la base, y no solo por convención. Hoy la ingesta la
rompe: sus cuatro `INSERT` de la transformación 07 terminan en
`ON CONFLICT (event_hash) DO UPDATE SET contenido, fecha_registro`. Como el contenido
forma parte del hash, lo único que cambia es `fecha_registro`, que se toma del
`Modified` del ticket. Así, la fecha de cada evento legacy es la última modificación del
ticket, no el momento del comentario, y se mueve en cada ejecución. La ingesta reescrita
usa `DO NOTHING`. **Los 532 eventos existentes conservan la fecha que tengan al
desplegar**: corregirla exigiría el `UPDATE` que esta regla prohíbe, y SharePoint no
guarda la fecha real del comentario. El retiro sigue el mismo orden de despliegue que el
de `id_estado` (recuadro de abajo).

**Tampoco se borra un ticket con historial** (decidido el 25-sep-2026). Las tres tablas
que dependen de `fact_ticket` (eventos, salida a SharePoint y referencia legacy) tienen
`ON DELETE CASCADE`, y `coraje_runtime` y `coraje_etl` tienen `DELETE` sobre
`fact_ticket`. PostgreSQL ejecuta la cascada con los permisos del dueño de la tabla, así
que borrar un ticket se llevaría sus eventos aunque nadie tuviera `DELETE` sobre
`fact_ticket_evento`. Por eso:

- a `coraje_runtime` y `coraje_etl` se les retira `DELETE` sobre `fact_ticket`. Nada lo
  usa: la aplicación no toca la tabla, y el único `DELETE` de los workflows de `n8n/` es
  sobre `staging`. En la v1 un ticket no se borra: se rechaza (T8);
- la clave foránea de `fact_ticket_evento` hacia `fact_ticket` pasa a
  `ON DELETE RESTRICT`. Incluso un borrado de emergencia con `coraje_app` falla si el
  ticket tiene eventos.

**Al construir (25-sep-2026) salieron dos precisiones:**
- **Se retira también `INSERT` sobre `fact_ticket_evento`.** Es la regla 2 de §3: si
  los roles pudieran insertar directamente, un evento podría declarar un cambio de
  estado que la proyección no tuvo. Todo evento nace en el escritor.
- **Un `REVOKE UPDATE (id_estado)` no basta.** En PostgreSQL, el `UPDATE` concedido
  sobre la tabla cubre todas sus columnas y un `REVOKE` de columna no lo anula. Hay que
  retirar el `UPDATE` de tabla y concederlo columna por columna, sin `id_estado`. Una
  columna nueva de `fact_ticket` no será actualizable por esos roles hasta concederla.

**La historia de los tickets existentes se completa con un evento por ticket.** Cada
ticket migrado recibe un evento `MIGRACION_LEGACY` con su estado inicial, idempotente por
`event_hash`. Son solo `INSERT`: nada existente se modifica ni se borra.

> **`RIESGO` Orden de despliegue obligatorio.** Primero la ingesta nueva, versionada
> como bloque en `n8n/` y verificada en una ejecución real; después, el retiro del
> privilegio. En el orden inverso, la siguiente ingesta falla y la base deja de recibir
> lo que el equipo sigue haciendo en PowerApps. Desde el 24-sep-2026 el fallo avisa en
> Teams (`n8n/Alertas de errores a Teams.json`); del 14 al 24-sep-2026 pasó 22 veces sin
> que nadie se enterara.
>
> **`DEPENDENCIA`** El estado inicial de ese evento tiene que ser correcto antes de
> escribirse, porque el log solo admite añadir filas. Hoy la transformación 06 convierte
> el `Reasignado` de SharePoint en `ABIERTO`: no tiene fila en `dim_estado` y cae en el
> valor por defecto. La traducción correcta está en §4.2.

## 4. Vocabulario de estados

> **`RATIFICADO` (03-sep-2026), salvo lo que sigue marcado aparte.** El usuario confirmó
> contra el uso real, sin levantamiento formal de PowerApps: sí falta un estado para
> cuando se necesita información de quien radicó el ticket, y el término se generaliza
> — no es solo "cliente" externo, es cualquier **solicitante**, incluido un empleado
> interno que abrió el caso para sí mismo. De ahí el nombre `ESPERANDO_SOLICITANTE`
> abajo, coherente con `id_solicitante`/`id_cliente_contai` que ya distingue §7.1.

> **`DECISIÓN` (24-sep-2026): la v1 es fiel al proceso del legacy, no a sus defectos.**
> Sustituye en parte la ratificación anterior. La v1 reproduce lo que las personas hacen
> hoy en PowerApps (`legacy/reglas-negocio-powerapps.md` §2, §6–§8): responder cierra el
> ticket, no hay reapertura, la reasignación queda dentro del área y la calificación es
> opcional. **No** reproduce cómo está construido: el permiso por correo quemado, la
> consulta sin restricción, el correo enviado antes de guardar y `Estado` como texto
> libre (§10 de ese documento) se corrigen desde el principio.
>
> En consecuencia, **`EN_PROCESO` y `RESUELTO` quedan fuera de la v1.** Que alguien ya
> empezó a trabajar un ticket se deduce de sus eventos, sin estado propio. Añadir
> cualquiera de los dos después es un `INSERT` en `dim_estado` más sus transiciones
> (recuadro al final de esta sección), no una migración de tipo.

> **`DECISIÓN` (25-sep-2026): `ESPERANDO_SOLICITANTE` también queda fuera de la v1.**
> Revierte para la v1 la ratificación del 03-sep de arriba. El estado no existe en el
> legacy de PowerApps (`legacy/reglas-negocio-powerapps.md`) ni en lo que quedó
> documentado del prototipo `helpdesk_santi/` (§11), y la v1 no añade a lo que hay en
> esas dos fuentes. Como hoy, la información que falta se pide por fuera y el ticket
> sigue en `ASIGNADO` con el plazo corriendo. El costo es aceptar en la v1 el defecto 1
> de §5. Añadirlo después es una fila en `dim_estado` y dos transiciones, más la acción
> del catálogo que autorice salir de la espera, que tampoco existe.
>
> **La v1 tiene cuatro estados:** `ABIERTO`, `ASIGNADO`, `CERRADO` y `RECHAZADO`.

Los tres estados actuales **no alcanzan** para operar una mesa de ayuda. Con
`ABIERTO / CERRADO / RECHAZADO` no se puede distinguir un ticket que nadie ha mirado de
uno que alguien está atendiendo, ni representar la espera de información de quien lo
radicó. Faltan, como mínimo:

| Estado propuesto | Significado | Por qué es necesario |
|---|---|---|
| `ABIERTO` | Radicado, sin área ni responsable | Ya existe |
| `ASIGNADO` | Tiene área y responsable; nadie ha empezado | Separa la cola de reparto del trabajo real |
| `EN_PROCESO` | Alguien lo está atendiendo | **Fuera de v1.** Sin él, «abierto» mezcla lo abandonado con lo activo |
| `ESPERANDO_SOLICITANTE` | Falta información de quien radicó el ticket — cliente externo o empleado interno | **Fuera de v1** (25-sep-2026). Reiniciaría el plazo de respuesta al salir (§5) |
| `RESUELTO` | Hay respuesta; falta confirmación o plazo | **Fuera de v1.** Permite reapertura sin resucitar un cerrado |
| `CERRADO` | Terminal. En v1, se llega respondiendo, como en el legacy | Ya existe |
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

### 4.1 `DECISIÓN` (24-sep-2026) Transiciones de la v1

Cada transición la autoriza una acción del catálogo de `specs/permisos.md` §3, evaluada
con su alcance (§4 de ese documento). La columna «Plazo» aplica el reloj por turno de §5.

| # | Transición | Acción del catálogo | Plazo | Base |
|---|---|---|---|---|
| T1 | (nuevo) → `ABIERTO` | Crear / Crear en nombre de un cliente | Ninguno | Portal de clientes, o ninguna regla de enrutamiento resuelve área y responsable |
| T2 | (nuevo) → `ASIGNADO` | Crear | Empieza el de la firma | `routing_rule` resuelve área y responsable. Es el caso normal: en el legacy, `Recibe` queda fijado al crear |
| T3 | `ABIERTO` → `ASIGNADO` | Redirigir / clasificar | Empieza el de la firma. En tickets de clientes, **aquí y no antes** | El `/redireccion` actual |
| T4 | `ASIGNADO` → `ASIGNADO`, otra persona de la misma área | Asignar responsable | **Se conserva** | Legacy §6: el destino se limita al área de quien asigna, y reasignar no reinicia el SLA |
| T7 | `ASIGNADO` → `CERRADO` | Responder al cliente | Termina | Legacy §7: responder y cerrar son un solo paso |
| T8 | `ABIERTO` / `ASIGNADO` → `RECHAZADO` | Rechazar, con motivo obligatorio | Termina | Nunca usado en los datos reales (V9), pero está en el catálogo |

T5 (entrar en `ESPERANDO_SOLICITANTE`) y T6 (salir de él) se retiraron con ese estado
el 25-sep-2026 (§4). Los demás números se conservan para no romper las referencias.

`CERRADO` y `RECHAZADO` son **terminales**: la v1 no tiene reapertura, igual que el
legacy. Si un problema vuelve después del cierre, se abre un ticket nuevo. Registrar
una nota interna, añadir un observador, solicitar validación y calificar **no cambian
el estado**. Solicitar validación **no bloquea** el avance del ticket (§11, decidido el
24-sep-2026).

No hay redirección a otra área desde un ticket ya asignado, porque el legacy no la
permite. Si hace falta, se añade como transición nueva.

Ninguna transición de la v1 la ejecuta el solicitante ni un cliente: todas las autoriza
una acción del catálogo que tiene un empleado. Por eso el catálogo de `permisos.md` §3
no necesita acciones nuevas para la v1.

### 4.2 `DECISIÓN` (24-sep-2026) Traducción de los estados legacy

El evento `MIGRACION_LEGACY` de cada ticket (§3.1) registra el estado según los
**datos** del ticket, no según el texto de SharePoint:

| `Estado` en SharePoint | Estado en la v1 |
|---|---|
| `Cerrado` | `CERRADO` |
| `Abierto` o `Reasignado`, con área y responsable | `ASIGNADO` |
| `Abierto` o `Reasignado`, sin área o sin responsable | `ABIERTO` |

- **El responsable es `AsignadoA` y, si está vacío, `Recibe`.** En el legacy, `Recibe`
  queda fijado al crear el ticket y esa persona responde o reasigna
  (`legacy/reglas-negocio-powerapps.md` §6). La ingesta actual solo copia `AsignadoA` a
  `id_asignado` y no guarda `Recibe` en ninguna parte.
- **El estado inicial sale de SharePoint (`staging.sp_helpdesk_raw`), no de
  `fact_ticket`.** SharePoint es hoy quien manda sobre los tickets legacy, y
  `fact_ticket` puede ir por detrás de él: del 14 al 24-sep-2026 la ingesta estuvo
  detenida y 20 tickets cerrados seguían en `ABIERTO`.
- **El evento guarda el texto original** (`Abierto`, `Reasignado`, `Cerrado`), para que
  la traducción se pueda revisar sin volver a staging.

**Datos reales, 24-sep-2026:** en staging hay `Cerrado`=2.838, `Reasignado`=30 y
`Abierto`=24. De los tickets no cerrados que no tienen `AsignadoA`, 25 tienen `Recibe` y
resuelven contra `core.dim_personal`; uno no tiene ninguno de los dos y queda en
`ABIERTO`. El único ticket sin referencia a SharePoint, de `PORTAL_CLIENTE`, era una
prueba y se borró (25-sep-2026).

Requiere añadir `ASIGNADO` a `helpdesk.dim_estado`, con una migración Prisma que solo
inserta filas en el catálogo.

## 5. SLA

`fecha_limite` se calcula al crear, sumando `dias_sla` de la prioridad en **días hábiles
colombianos** mediante `core.add_colombia_business_days`. Esa parte está bien resuelta y
se conserva.

Tres defectos del modelo actual, ninguno hipotético:

| # | Defecto | Consecuencia |
|---|---|---|
| 1 | El reloj **no se detiene nunca** | Un ticket esperando tres días al solicitante incumple el SLA por una demora que no es responsabilidad de la firma. La métrica deja de medir lo que debería |
| 2 | `fecha_limite` **no se recalcula** al cambiar la prioridad | Subir un ticket a prioridad alta no adelanta su vencimiento |
| 3 | **No existe prioridad `ALTA`** | El catálogo tiene `BAJA` y `MEDIA`. La creación desde el portal fuerza `MEDIA` para todo |

> **`DECISIÓN` (03-sep-2026): reinicio completo, no pausa.** Al salir de
> `ESPERANDO_SOLICITANTE`, `fecha_limite` se **recalcula igual que al crear** —
> `fecha_actual + dias_sla` de la prioridad vigente— sin conservar el tiempo ya
> consumido antes de entrar en espera. Es más simple de construir que una pausa (no
> exige una columna de tiempo acumulado, solo repetir el mismo cálculo de creación), y
> es la opción elegida explícitamente por el usuario tras conocer la alternativa.
>
> **`RIESGO` aceptado, no accidental.** Un ticket puede entrar y salir de
> `ESPERANDO_SOLICITANTE` varias veces, y cada salida le da un plazo fresco completo.
> El tiempo real transcurrido desde que se radicó puede ser mucho mayor que lo que el
> SLA reporta, y ningún ticket que pase por esta rotación incumple nunca formalmente.
> Se acepta así, con el riesgo declarado — no es un descuido, es la decisión tomada
> conociendo la alternativa de pausa-y-reanuda.

> **`DECISIÓN` (24-sep-2026): el reloj mide a quién le toca actuar, no cuántas veces
> cambió el estado.** Generaliza la decisión anterior sin contradecirla. El plazo se
> reinicia solo cuando el turno pasa de la firma al solicitante y vuelve. Los cambios
> internos —reasignar, escribir notas, pedir validación— **conservan** el plazo que
> corre. Si no fuera así, quien debe cumplir el plazo tendría en sus manos lo que lo
> reinicia. **En la v1 no hay ningún cambio de turno**, porque `ESPERANDO_SOLICITANTE`
> quedó fuera (§4, 25-sep-2026): el plazo corre desde que empieza hasta el cierre o el
> rechazo, como en el legacy, y el defecto 1 de la tabla de arriba se acepta. La regla
> queda escrita por turno, y la decisión del 03-sep de reiniciar completo, para cuando
> ese estado se añada.
>
> - **Tickets internos:** el plazo sale de la prioridad que elige quien radica, como en
>   el legacy (`BAJA` 5 días, `MEDIA` 3 días hábiles). Se revisa con datos de uso, no se
>   cambia de entrada.
> - **Tickets de clientes (Coraje): 3 días hábiles fijos**, sin prioridad elegible, y el
>   plazo **empieza al redirigir** (T3), no al radicar. Requisito de la firma.
> - **Se miden, sin plazo:** el tiempo total desde que se radicó el ticket, el número de
>   idas y vueltas con el solicitante y el tiempo en `ABIERTO` antes de redirigir. Todo
>   sale de los eventos, sin columnas nuevas. Es la mitigación del `RIESGO` de arriba:
>   el SLA por turno no muestra quién alarga un ticket con preguntas, y estas tres
>   medidas sí.

> **`PENDIENTE` Festivo de la Ley 2578 de 2026.** Crea el festivo de Nuestra Señora del
> Rosario de Chiquinquirá: 9 de julio, trasladable al lunes por Ley Emiliani (en 2026
> fue el lunes 13 de julio). `core.is_colombia_holiday` (baseline, `coraje-web/prisma/migrations/`)
> calcula los festivos por regla y **no lo incluye**. Hay que añadirlo solo para años
> `>= 2026`, sin alterar años anteriores. No es urgente: el de 2026 ya pasó y el próximo
> cae en julio de 2027. Va en la unidad del reloj de SLA (§9, entrega 7), como
> migración Prisma. **Hay una demanda de inconstitucionalidad en curso**: la ley sigue
> vigente mientras la Corte Constitucional no decida. Si la tumba, se retira la regla.

**Los escalados y avisos por SLA son consultas contra PostgreSQL disparadas por un
scheduler.** La ventana se cierra sola y el tiempo no llama a nadie, así que n8n aporta
un golpe periódico que pregunta; la regla vive en la base. n8n **no** decide qué está
vencido.

## 6. Registro de eventos: lo que le falta al modelo actual

`fact_ticket_evento` admite cuatro tipos —`COMENTARIO`, `REASIGNACION`,
`CAMBIO_ESTADO` y `MIGRACION_LEGACY`, según el `CHECK` de la migración baseline— y
tiene `event_hash` para idempotencia del ETL, que es un acierto y se conserva. El SQL
anterior a Prisma listaba además `CREACION` y `CANCELACION_CLIENTE`; la base viva no
los admite.

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

> **`DECISIÓN` (24-sep-2026): los eventos legacy son `INTERNO`.** Los 532 eventos
> existentes son todos `COMENTARIO`, derivados de cuatro columnas de SharePoint (V11), y
> ninguno se escribió para un cliente: en el legacy no había acceso externo. Mostrar por
> error una observación interna es peor que ocultar una nota antigua. Los eventos
> `MIGRACION_LEGACY` de §3.1 también nacen `INTERNO`.

> **`DECISIÓN` (25-sep-2026): en la v1 el autor de un evento es un empleado o el
> sistema.** Se añade `tipo_actor` (`EMPLEADO` / `SISTEMA`) con un `CHECK` que lo ata a
> `id_autor`: `EMPLEADO` exige `id_autor`, y `SISTEMA` lo exige vacío.
>
> - **Son `SISTEMA`:** los 532 eventos legacy, los `MIGRACION_LEGACY` y todo cambio de
>   estado que escriba la ingesta. La ingesta nunca ha llenado `id_autor` (sus
>   `INSERT` no incluyen la columna), y SharePoint no guarda quién cambió el estado de un
>   ticket: atribuir ese cambio a una persona sería inventar el dato.
> - **El cliente no es actor en la v1.** No existe dónde referenciarlo mientras
>   `specs/acceso-clientes.md` siga bloqueado, y ninguna transición de la v1 la ejecuta
>   él (§4.1). Añadirlo es aditivo: `CLIENTE` en el `enum` (decisión siguiente), una
>   columna nueva que acepte vacío con su clave foránea, ampliar el `CHECK`, y recrear la función del escritor único (§3.1),
>   cuya firma cambia y por eso no admite `CREATE OR REPLACE`.
> - **Diferencia con Impulsa:** su `EventActor` guarda el tipo y una columna por actor,
>   pero en sus migraciones no aparece un `CHECK` que ate el tipo a su columna. Aquí se
>   exige desde el principio.

> **`DECISIÓN` (25-sep-2026): catálogo de tipos de evento de la v1.** Un tipo por cada
> acción con transición decidida en §4.1; lo que aún no tiene diseño no entra.
>
> | Tipo | Cuándo | Origen |
> |---|---|---|
> | `CREACION` | T1, T2 | Nuevo |
> | `REDIRECCION` | T3: fija área y responsable, empieza el plazo | Nuevo |
> | `REASIGNACION` | T4: otra persona de la misma área | Existente |
> | `RESPUESTA` | T7: responder cierra el ticket | Nuevo |
> | `RECHAZO` | T8, con motivo | Nuevo |
> | `COMENTARIO` | Nota interna, sin cambio de estado | Existente, 532 filas legacy |
> | `MIGRACION_LEGACY` | Estado inicial de cada ticket migrado (§3.1) | Existente |
> | `SINCRONIZACION_LEGACY` | La ingesta observa en SharePoint un cambio de estado. Siempre `SISTEMA` | Nuevo; deja de escribirse al retirar SharePoint |
>
> - **Se retira `CAMBIO_ESTADO`.** El cambio queda en `estado_anterior` / `estado_nuevo`,
>   y el tipo dice qué acto lo produjo. No tiene filas (V11); la migración lo comprueba
>   antes de quitarlo y falla si encuentra alguna.
> - **No se renombra ningún tipo con filas.** Hacerlo sería un `UPDATE` sobre el
>   registro de eventos (§3, regla 1).
> - **Se añaden con su entrega, no ahora:** observadores y solicitud de validación (§11)
>   y calificación. Están en la v1, pero su diseño sigue pendiente.

> **`DECISIÓN` (25-sep-2026): los vocabularios cerrados del evento son `enum` de
> Prisma**, no `CHECK`: `tipo_evento`, `tipo_actor` y `visibilidad`. Quedan visibles en
> `schema.prisma`, que es dueño del esquema desde D1, y tipados en TypeScript, igual que
> `RolAplicacion` y que Impulsa. Dos precauciones:
>
> - `ALTER TYPE … ADD VALUE` **va sola en su propio archivo de migración**, porque
>   Prisma envuelve cada archivo en una transacción. Quitar un valor exige recrear el
>   tipo y la función del escritor único que lo usa.
> - La ingesta actual inserta `'COMENTARIO'` como literal en un `INSERT … SELECT`, que
>   PostgreSQL convierte al tipo de la columna. **Es una inferencia sin ejercitar**: la
>   ingesta reescrita lleva el cast explícito al `enum`, y la conversión de la columna se
>   verifica con una ejecución real de la ingesta.
>
> El `CHECK` que ata `tipo_actor` a `id_autor` (decisión anterior) sigue siendo un
> `CHECK`: relaciona dos columnas, y eso un `enum` no lo expresa.

## 7. `RIESGO` Tres restricciones del esquema que hay que revisar antes de construir

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

**7.3 `DECISIÓN` (10-sep-2026) Modelo de buzón compartido — construido y ejercitado
contra la base real.** `core.dim_personal.correo_corporativo` no tiene
`UNIQUE`, y dos rutas
de carga distintas (`sql/elt/03_transform_personal.sql`, keyed por `sp_personal_id`, y
`sql/elt/04_transform_personal_historico.sql`, un `INSERT` de una sola vez guardado por
`correo NOT IN (...)`) pueden terminar con dos filas para el mismo correo cuando una
bandeja compartida cambia de ocupante — confirmado con `recepcion.gct@rbcol.co`: una
fila activa (la ocupante actual) y una fila fantasma "EX-EMPLEADO (RECUPERADO DEL
HISTORIAL)" a la que **155 tickets reales** (hoy **165**, tras la primera ejecución con
el fix — `docs/estado/handoff.md` §4) apuntan por `id_asignado`/`id_solicitante`.
Es el único correo duplicado hoy (`GROUP BY correo_corporativo HAVING count(*) > 1`
no devuelve otro), pero el mecanismo que lo permite es genérico, no un caso aislado.

**Regla dura, no negociable:** esos tickets **no pueden terminar atribuidos a quien
ocupa el buzón hoy**. Mientras no se recupere el nombre real de quien lo atendía en su
momento, se marcan con un responsable histórico explícitamente no identificado — nunca
con el nombre de la persona actual. **Verificado con datos reales:** los 10 tickets
nuevos que llegaron en la primera ejecución del fix quedaron en el marcador histórico,
no en la ocupante actual — la regla se sostiene sobre casos que no existían cuando se
diseñó, no solo sobre los 155 ya conocidos.

**Diseño construido (10-sep-2026), las cuatro preguntas abiertas resueltas así:**

- **Vigencia en el tiempo:** se descartó el rango de fechas (`vigente_desde`/
  `vigente_hasta`). No hay evidencia de cuándo cambió de manos el buzón conocido —
  inventar una fecha de corte violaría la disciplina de no afirmar lo que no se puede
  demostrar. En su lugar, `core.dim_personal` gana una columna booleana,
  `es_responsable_historico_no_identificado`, que **no representa un rango temporal**
  sino un marcador explícito: "esta fila absorbe la ambigüedad de un buzón compartido
  cuando no se puede saber cuál ocupante corresponde a cuál ticket". Es una
  simplificación deliberada, no una vigencia real — si algún día se recupera el dato de
  fechas, migrar a un modelo temporal es un cambio aditivo, no una reescritura.
- **Cómo la transformación elige una sola fila:** `sql/elt/06_transform_ticket.sql`
  reemplaza el `LEFT JOIN` directo contra `dim_personal` por un `LEFT JOIN LATERAL` que
  ordena por `es_responsable_historico_no_identificado DESC LIMIT 1` — si el correo
  tiene una sola fila, la resuelve sin que la marca importe; si tiene varias, prioriza
  siempre la marcada como histórica sobre cualquier persona real, nunca al revés. Así se
  cumple la regla dura sin necesitar la fecha del ticket.
- **Convención del marcador:** columna booleana en la fila misma
  (`es_responsable_historico_no_identificado`), no una fila sentinela aparte ni una
  convención de texto en `cargo` (el texto `'EX-EMPLEADO (RECUPERADO DEL HISTORIAL)'`
  sigue existiendo para lectura humana, pero ya no es la señal que el código interpreta).
  `sql/elt/04_transform_personal_historico.sql` marca la columna en `TRUE` para toda fila
  que inserta, porque por definición esas filas son inferidas de tickets legacy sin
  identidad recuperable.
- **Generalización:** el patrón cubre cualquier buzón futuro, no solo el caso conocido.
  Un índice único parcial (`ux_dim_personal_correo_historico`, solo sobre filas
  marcadas) impide que un mismo correo tenga dos marcadores históricos. Una validación
  al inicio de `06_transform_ticket.sql` (`DO $validate_shared_mailboxes$`) aborta la
  transformación completa si aparece un correo con más de una fila y **sin** exactamente
  un marcador — mismo criterio de "fallar fuerte antes que adivinar en silencio" que ya
  usa `01_transform_area.sql` para áreas desconocidas.

**Ejecución real, cerrada (10-sep-2026):** `ALTER TABLE` aplicado contra la VPS, fila
fantasma marcada (`UPDATE 1` exacto), índice único parcial creado, workflow de n8n
reimportado con el fix, ingesta corrida de punta a punta sin error. Detalle completo,
incluida una incidencia real (se publicó primero la copia del workflow sin el fix, por
confusión de nombre) y su resolución, en `docs/estado/handoff.md` §4 y Acción
inmediata.

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
- Reintentar la ingesta **no modifica** eventos ya escritos, y un `UPDATE` o `DELETE`
  sobre `fact_ticket_evento` con `coraje_runtime` o `coraje_etl` falla, con prueba
  negativa (§3.1).
- Un `DELETE` sobre `fact_ticket` con `coraje_runtime` o `coraje_etl` falla, y borrar
  con `coraje_app` un ticket que tiene eventos también falla, con prueba negativa
  (§3.1).
- ~~El tiempo en espera del cliente **no** consume SLA.~~ Fuera de la v1 junto con
  `ESPERANDO_SOLICITANTE` (§4, 25-sep-2026).
- Un evento de `SISTEMA` no tiene `id_autor` y uno de `EMPLEADO` sí, con prueba negativa
  contra el `CHECK` (§6).
- Un ticket no puede quedar en un estado sin transición de salida.
- Un observador ve el ticket y su historial visible según `visibilidad` (§6), y **no
  puede ejecutar ninguna acción del catálogo** — ver §11.
- Una solicitud de validación registra destinatario y comentario en la historia del
  ticket, y solo aparece a quien tiene permiso de verla — ver §11.

## 9. Orden de implementación

| # | Entrega | Depende de |
|---|---|---|
| 1 | **Levantamiento funcional de PowerApps** (§2) | Nadie más puede hacerlo |
| 2 | Ratificar vocabulario de estados y transiciones | 1 |
| 3 | Campos que faltan en el evento (§6) y decisión de esquema | 2 |
| 4 | Escritor único de eventos con proyección transaccional | 3 |
| 5 | Bandeja interna, asignación y respuesta | 4, `specs/permisos.md` |
| 6 | Observadores y solicitud de validación (§11) | 4, `specs/permisos.md` |
| 7 | Reloj de SLA y escalado. El reinicio al salir de `ESPERANDO_SOLICITANTE` queda fuera de la v1 (§4) | 4 |
| 8 | Vista del ticket en el portal del cliente | 4, `specs/acceso-clientes.md` |

---

## 10. Verificación contra código

| # | Afirmación a verificar | Dónde comprobarlo | Veredicto |
|---|---|---|---|
| V1 | `dim_estado` tiene exactamente tres filas | `sql/db/07_seed.sql` | **Verificado** 03-sep-2026 |
| V2 | `dim_prioridad` no tiene `ALTA` | `sql/db/07_seed.sql` | **Verificado** 03-sep-2026 |
| V3 | Los tipos de evento y su `CHECK` | `coraje-web/prisma/migrations/20260910000000_baseline/migration.sql` (`chk_fact_ticket_evento_tipo`) | **Corregido** 25-sep-2026: son **cuatro**, no seis. El veredicto del 03-sep se leyó en `sql/`, que no coincidía con la base viva y se retiró el 24-sep |
| V4 | `fact_ticket_evento` no tiene visibilidad ni estados anterior/nuevo | Ídem | **Verificado** 03-sep-2026 |
| V5 | `id_autor` solo referencia `core.dim_personal` | Ídem | **Verificado** 03-sep-2026 |
| V6 | El `CHECK` de origen exclusivo impide cliente y solicitante juntos | Ídem | **Verificado** 03-sep-2026 |
| V7 | `encargado_interno` no tiene clave foránea | Ídem y `schema.prisma` | **Verificado** 03-sep-2026 |
| V8 | El SLA se calcula al crear y no se recalcula ni se pausa | `src/app/portal/tickets/nuevo/actions.ts` | **Verificado** 03-sep-2026 |
| V9 | Estados reales usados por los tickets migrados | Consulta a `helpdesk.fact_ticket` agrupando por estado | **Verificado** 10-sep-2026, contra la VPS real — pero el total ya no es 2.313: son **2.559**. Solo `ABIERTO` y `CERRADO` tienen filas; `RECHAZADO` no se ha usado nunca (`handoff.md` §4) |
| V10 | Distribución real de prioridades en los datos migrados | Ídem | **Verificado** 10-sep-2026: `BAJA`=645, `MEDIA`=1911, sin prioridad=3 (coincide con `baseline-calidad.md`). Cero `ALTA`, consistente con V2 |
| V11 | Cuántos eventos legacy quedarían como `INTERNO` al añadir visibilidad | Consulta por `tipo_evento` | **Verificado** 24-sep-2026, contra la VPS real: 532 eventos, **todos `COMENTARIO`**, derivados de cuatro columnas legacy (`07_transform_ticket_evento.sql`). No existe ningún evento de estado. En la misma consulta, `staging.sp_helpdesk_raw` tiene `Cerrado`=2.838, `Reasignado`=30 y `Abierto`=24 |

> **Lectura del conjunto.** Diez de trece afirmaciones están verificadas contra el árbol
> o contra la base real. V9 y V10 confirman el vocabulario de estados propuesto en §4,
> pero abren una contradicción sin resolver: el total de tickets (2.559) no coincide con
> el baseline conciliado (2.313). Ver `handoff.md` §4 — no se resuelve aquí, y el modelo
> de eventos no debería cerrarse sin saber cuál de los dos números es el real y por qué
> difieren. V11 sigue requiriendo consulta.

| V12 | Existe relación ticket↔observador en el esquema | `schema.prisma` / `prisma/migrations/` | **Sin verificar** — no construido |
| V13 | Existe tipo de evento de solicitud de validación con destinatario | Ídem | **Sin verificar** — no construido |
| V14 | Modelo de eventos de §6 y escritor único de §3.1 | `prisma/migrations/20260925120000_modelo_eventos_ticket` | **Desplegado** (25-sep-2026). Contrato en `src/server/tickets/event-model.contract.test.mts` |
| V15 | La ingesta escribe estado y eventos solo por el escritor | Nodos `PG - Transform 06` y `07` del workflow de ingesta | **Ejercitado** (25-sep-2026), dos ejecuciones: 2.898 `MIGRACION_LEGACY`, 0 tickets sin inicio, 0 desfasados, segunda ejecución sin eventos nuevos |
| V16 | Privilegios retirados, con prueba negativa (§8) | `prisma/migrations/20260925180000_proteger_estado_y_eventos` | **Construido, sin ejercitar**: falta la prueba negativa contra la base |

## 11. `PROPUESTA` Observadores y solicitud de validación — confirmado para v1

```
FUENTE:  prototipo funcional (`helpdesk_santi/`, HTML/JS estático, sin backend) hecho
         por la persona encargada de TI — quien más usa la mesa de ayuda actual y más
         sufre sus límites. No es referencia visual: se toma únicamente el concepto.
ESTADO:  confirmado por el usuario para la primera versión (03-sep-2026). No es una
         idea a evaluar — es una decisión tomada, sin diseño técnico completo todavía.
```

**Observadores.** Un ticket puede tener personas añadidas para que reciban
seguimiento sin ser responsables de atenderlo — el patrón *watcher/CC* de cualquier
mesa de ayuda. En el prototipo se seleccionan al crear el caso, de una lista fija
(`Soporte TI`, `Administrador del sistema`, `Jefe de área`), y se muestran de solo
lectura en el detalle a ambos lados.

- **Alcance de v1: solo lectura y notificación, sin acciones.** Un observador ve el
  ticket y su historial visible según `visibilidad` (§6) — lo mismo que vería un
  agente interno, no una vista recortada — pero no puede ejecutar ninguna acción del
  catálogo de `specs/permisos.md` §3. No hay evidencia en el prototipo de observador
  externo (cliente); se declara **fuera de alcance** hasta que se pida explícitamente.
- **`DECISIÓN` pendiente al construir, no asumida aquí:** el prototipo modela
  observadores como una lista fija de **etiquetas de rol** (`Jefe de área`,
  `Administrador del sistema`), no como personas reales de `core.dim_personal`. Eso
  repetiría el defecto ya señalado en §7.2 (`encargado_interno` como texto libre). La
  relación debe ser `FK` a `core.dim_personal`, no texto libre — pero **el catálogo de
  roles/puestos que permitiría ofrecer "Jefe de área" como opción no existe todavía**
  (`specs/permisos.md` §6, `ABIERTO`). Observadores y solicitud de validación son la
  segunda y tercera necesidad concreta que empuja a resolver ese vacío, no una razón
  para resolverlo aquí de forma apurada.
- Requiere una nueva relación N:M ticket↔persona (p. ej. `helpdesk.ticket_observador`),
  y un nuevo tipo de evento o campo para registrar quién añadió a quién y cuándo — se
  decide junto con el resto del modelo de eventos (§6), no antes.

**Solicitud de validación.** Un agente puede dirigir una petición de aprobación a una
persona específica, con comentario, antes de continuar. En el prototipo esto se
implementa como un evento más del timeline unificado (mismo mecanismo que "Responder"
o "Agregar solución"), dirigido a un destinatario — **el prototipo no implementa una
respuesta de aprobar/rechazar**, solo el registro de la solicitud.

- **No es lo mismo que la autorización excepcional de `specs/permisos.md` §5.** Esa es
  para actuar *fuera* del alcance ordinario, exige justificación obligatoria y se
  audita como excepción. Esto es un paso *ordinario* del flujo normal de un ticket:
  pedirle a alguien más que confirme algo antes de seguir. No confundas ambos
  mecanismos al construir.
- **`DECISIÓN` (24-sep-2026): no bloquea.** La solicitud es una notificación dirigida
  que queda en el historial sin efecto sobre el estado, igual que en el prototipo. No
  hay estado de aprobación ni respuesta de aprobar/rechazar en la v1 (§4.1).
- Mismo destinatario dirigido a persona real, misma dependencia del catálogo de
  personas/roles que Observadores.

**Relación con `specs/permisos.md` §3 (separación de acciones):** ambas son acciones
propias nuevas del catálogo — "ser observador" no es lo mismo que "Consultar" (que
tiene su propia frontera de clientes, más amplia), y "solicitar validación" no es lo
mismo que "Autorización excepcional" (§5). Se añaden al catálogo, no se disuelven en
uno existente.

**Changelog:** 03-sep-2026 — línea base. Declara el bloqueo por ausencia de
levantamiento de PowerApps (§2); adopta el modelo de estado derivado de eventos con
escritor único (§3); propone el vocabulario mínimo de siete estados contra los tres
existentes (§4); registra los tres defectos del SLA (§5), los tres campos ausentes del
evento (§6) y las dos restricciones de esquema a revisar (§7).
- 03-sep-2026 (mismo día) — añade §11: Observadores y solicitud de validación,
  confirmados por el usuario para v1 a partir del prototipo `helpdesk_santi/`. Ninguno
  construido; ambos dependen del catálogo de roles/personas, en ese momento todavía
  `ABIERTO` en `specs/permisos.md` §6 (ver entrada siguiente: ya no lo está).
- 03-sep-2026 (mismo día) — §4 ratifica sin levantamiento formal de PowerApps: hace
  falta un estado nuevo, generalizado a `ESPERANDO_SOLICITANTE` (cliente externo o
  empleado interno). §5 decide su semántica de SLA: reinicio completo al salir, no
  pausa — riesgo de uso repetido para nunca incumplir, aceptado explícitamente por el
  usuario conociendo la alternativa. `specs/permisos.md` §6 pasa de `ABIERTO` a
  `RATIFICADO (parcial)` en la misma conversación: Alex y Jimena, los dos únicos casos
  reales conocidos, no cargan ningún rol adicional sobre "responsable de su área".
- 10-sep-2026 — V9 y V10 se verifican contra la base real de producción (167 personal
  activo, distribución de estados/prioridades). Se abre una contradicción sin resolver:
  el total real (2.559 tickets) no coincide con el baseline conciliado de
  `legacy/baseline-calidad.md` (2.313). Registrada en `estado/handoff.md` §4, no
  resuelta aquí.
- 10-sep-2026 (mismo día) — añade §7.3: modelo de buzón compartido, dirección tomada
  tras encontrar el bug real ejecutando manualmente la transformación de tickets
  (`core.dim_personal` duplicado por correo, 155 tickets afectados). Regla dura: esos
  tickets nunca quedan atribuidos a quien ocupa el buzón hoy. Diseño exacto (vigencia
  en el tiempo, convención del marcador histórico) sigue sin resolver.
- 10-sep-2026 (mismo día, unidad siguiente) — §7.3 cierra su diseño: columna
  `es_responsable_historico_no_identificado` en `core.dim_personal` en vez de rango de
  fechas (sin evidencia de cuándo cambió de manos el buzón), resolución por
  `LEFT JOIN LATERAL` con prioridad a la fila histórica en `06_transform_ticket.sql`,
  índice único parcial y validación que aborta ante ambigüedad sin marcador. Construido
  en el repositorio y en la copia embebida del workflow de n8n; **sin aplicar todavía
  contra la base real ni reimportado a la instancia viva de n8n** —
  `docs/estado/handoff.md` trae los comandos exactos.
- 10-sep-2026 (mismo día, misma unidad) — **§7.3 ejercitado con éxito contra la base
  real.** El usuario aplica el esquema, reimporta el workflow (tras una confusión real
  con una copia sin el fix) y ejecuta la ingesta de punta a punta: 155 → 165 tickets del
  buzón compartido, todos en el marcador histórico. Detalle completo en
  `docs/estado/handoff.md` §4.
- 24-sep-2026 — U6, punto 1. §2 declara como suposición la pregunta 3 de U0, cuyo texto
  no quedó registrado. §4 decide una v1 fiel al proceso del legacy y no a sus defectos:
  cinco estados, sin `EN_PROCESO` ni `RESUELTO`. Nueva §4.1 con las transiciones de la
  v1, sin reapertura; queda pendiente quién ejecuta T6. §5 generaliza el reloj a «por
  turno», fija 3 días desde la redirección para clientes y registra como pendiente el
  festivo de la Ley 2578 de 2026. §11: la solicitud de validación no bloquea.
- 24-sep-2026 (mismo día) — U6, punto 2. Nueva §3.1: el escritor único vive en
  PostgreSQL con privilegios por columna, la ingesta legacy también escribe el evento y
  cada ticket migrado recibe un evento `MIGRACION_LEGACY` con su estado inicial.
- 25-sep-2026 — U6, punto 3: queda resuelto por el punto 2. El escritor vive en SQL
  porque la regla la hace cumplir PostgreSQL; su firma y la llamada desde Prisma
  (`$queryRaw` en transacción) son trabajo de construcción.
- 25-sep-2026 — U6, punto 4. §4 saca `ESPERANDO_SOLICITANTE` de la v1: no está en el
  legacy ni en el prototipo. Quedan cuatro estados, se retiran T5 y T6 (§4.1), y el
  defecto 1 del SLA se acepta en la v1 (§5). §6: el actor es `EMPLEADO` o `SISTEMA`, con
  un `CHECK` que ata el tipo a `id_autor`. Se corrige V3: la base admite cuatro tipos de
  evento, no seis.
- 25-sep-2026 — U6, punto 5. §6: catálogo de ocho tipos para la v1, sin
  `CAMBIO_ESTADO` y con `SINCRONIZACION_LEGACY`; `tipo_evento`, `tipo_actor` y
  `visibilidad` pasan a `enum` de Prisma. §3.1: la ingesta reescribía `fecha_registro`
  de los eventos legacy en cada ejecución; pasa a `DO NOTHING`, y se retiran `UPDATE` y
  `DELETE` sobre `fact_ticket_evento` a `coraje_runtime` y `coraje_etl`.
- 25-sep-2026 — U6, última decisión. §3.1: la cascada `ON DELETE CASCADE` de `fact_ticket` dejaba
  borrar eventos por la vía del ticket; se retira `DELETE` sobre `fact_ticket` a
  `coraje_runtime` y `coraje_etl`, y la clave foránea de eventos pasa a
  `ON DELETE RESTRICT`.

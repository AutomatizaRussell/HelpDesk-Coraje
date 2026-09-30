# Permisos ejecutables

```
ESTADO:      construido, sin desplegar (corte 18, 26-sep-2026): catálogo en
             `app.permiso_accion` / `app.permiso_regla`, autorizador en
             `src/server/authorization/`, cada acción del ticket conectada en su
             comando. Falta la autorización excepcional (§5) y la consola (§8).
             Corte 21 (U10): acciones `salud.*` para `ADMIN` (§4.3). Corte 22
             (U11): observadores, validación y comentario del solicitante (§4.4).
             Corte 24 (U13): `COLABORADOR` y visibilidad por recepción (§4.5),
             sin desplegar
CORTE:       30-sep-2026
EVIDENCIA:   `tsc`, `lint`, `pnpm test` (alcance, catálogo sembrado y consultado,
             sin comparaciones de rol). Sin ejercitar contra la base
BLOQUEO:     parcialmente levantado (03-sep-2026) — el usuario confirmó directamente,
             sin levantamiento formal, que no hay rol adicional detrás de las dos
             únicas excepciones hardcodeadas del legacy (§6). Sigue sin construirse la
             columna de rol en el directorio (`specs/acceso-empleados.md` §7.1)
```

**Autoridad:** este documento es propietario del gobierno de permisos. La identidad
interna vive en `specs/acceso-empleados.md`; la externa, en `specs/acceso-clientes.md`.
Autenticar no es autorizar, y este documento solo se ocupa de lo segundo.

## 1. Regla estructural

**PostgreSQL es la única fuente operativa de las reglas delegables.** El código consulta
un permiso técnico y su alcance efectivo; no compara roles.

> **`INVARIANTE`** Ninguna condición de rol se escribe en un componente, una vista, un
> handler ni un servicio. **Nada de comparar roles a mano, ni siquiera para ocultar
> interfaz.** Si el permiso no existe en el catálogo, se añade al catálogo y después se
> consume. Ocultar un botón no es autorizar: el *server action* que ese botón invocaba
> sigue exportado, y lo llama quien conozca su nombre.

## 2. Por qué un autorizador ejecutable y no condiciones dispersas

La alternativa —`if (usuario.rol === "ADMIN")` allí donde haga falta— falla de tres
maneras conocidas, todas observadas en el proyecto hermano antes de corregirlas:

1. **No se puede auditar.** No hay forma de responder «quién puede hacer esto» sin leer
   todo el código.
2. **Diverge.** La misma regla escrita en la vista y en el servicio se separa en el
   primer cambio, y la vista suele ser la que se actualiza.
3. **Se olvida.** Una ruta nueva sin condición queda abierta, y nada lo señala.

## 3. Separación de acciones

El catálogo distingue como acciones **separadas** lo que un rol suele hacer junto. La
regla que lo justifica: **quien prepara no expone.**

Aplicado al ticket, y sujeto a §6:

| Acción | Por qué es propia |
|---|---|
| Consultar | La lectura tiene su propia frontera de clientes |
| Crear en nombre de un cliente | Radicar por teléfono no es lo mismo que atender |
| Redirigir / clasificar | Decide a qué área va el trabajo |
| Asignar responsable | Decide de quién es el trabajo |
| Responder al cliente | **Sale de la firma.** Es la acción que expone |
| Registrar nota interna | No sale. Fricción mínima a propósito |
| Cerrar | Declara terminado |
| Rechazar | Declara que no se atiende, con motivo |
| Reabrir | **Fuera de v1** (`specs/tickets.md` §4.1): no hay reapertura. Cuando exista `RESUELTO`, deshará una resolución, no un terminal |
| Administrar accesos de clientes | Concede acceso externo |
| Añadir/quitar observador (§10) | Da seguimiento sin dar responsabilidad de atender |
| Solicitar validación (§10) | Pide confirmación a alguien más antes de seguir; **no** es autorización excepcional (§5) |

> Los **reintentos técnicos son automáticos y durables**: no forman parte del catálogo
> de acciones manuales. El worker reclama lo elegible y la interfaz informa estado,
> intento y próxima ejecución. **No dependen del rol.**

## 4. Alcance, no solo permiso

Un permiso responde «qué puede hacer»; el alcance responde «sobre qué». Los dos se
evalúan, y el segundo es el que se olvida.

| Dimensión | Pregunta |
|---|---|
| Acción | ¿Tiene el permiso técnico? |
| Área | ¿El ticket pertenece a un área que le corresponde? |
| Cliente | ¿Tiene frontera sobre ese cliente? |
| Estado | ¿La acción procede desde el estado actual del ticket? |

**La interfaz solo presenta como efectiva una combinación de permiso y estado cuando el
servicio aplica la misma frontera.** Si difieren, la interfaz miente y el usuario
descubre el límite al chocar contra él.

### 4.1 `DECISIÓN` (25-sep-2026) Catálogo y alcances de la v1

El alcance de cada regla es `PROPIO`, `AREA` o `TOTAL`. Cada uno incluye al anterior.
Su significado vive en un solo sitio, `src/server/authorization/scope.ts`:

- **`PROPIO`**: para actuar, ser el responsable del ticket (como en el legacy, §6 de
  `legacy/reglas-negocio-powerapps.md`). Para consultar, también haberlo radicado.
- **`AREA`**: `PROPIO` más los tickets cuya área destino es la de la persona.
- **`TOTAL`**: cualquier ticket. Ningún rol lo tiene en la v1.

| Acción | `AGENTE` |
|---|---|
| `ticket.consultar` | `AREA` |
| `ticket.crear` | `PROPIO` (a nombre propio) |
| `ticket.reasignar` | `PROPIO`, a otra persona activa con rol de **su** área |
| `ticket.responder` | `PROPIO` |
| `ticket.rechazar` | `PROPIO` |
| `ticket.nota_interna` | `AREA` |
| `ticket.notificacion.reenviar` | `PROPIO`: solo quien envió el correo, porque sale de su buzón |

Quien solo radicó un ticket ve su historia sin las notas internas (`specs/tickets.md`
§6).

### 4.2 `DECISIÓN` (28-sep-2026, U8) Redirigir, accesos de clientes y dos roles nuevos

Construido en `20260928110000_acceso_clientes`, sin desplegar.

| Acción | `AGENTE` | `CLASIFICADOR` | `ADMIN` |
|---|---|---|---|
| Las siete de §4.1 | Como arriba | Copia de `AGENTE` | Copia de `AGENTE` |
| `ticket.redirigir` (T3) | — | `TOTAL` | — |
| `portal.acceso.administrar` | — | — | `TOTAL` |

- **Separados por decisión del usuario:** quien reparte lo que entra del portal no
  concede acceso externo (§3, «quien prepara no expone»). `CLASIFICADOR` y no
  `RECEPCION`, para no confundirlo con la recepción física de la firma.
- **`TOTAL` para redirigir no es un privilegio especial:** un ticket sin clasificar no
  tiene responsable ni área, así que ni `PROPIO` ni `AREA` lo cubren
  (`scope.ts`, prueba en `client-access.contract.test.mts`).
- **Copia, no herencia.** Cambiar una regla de `AGENTE` después no la cambia en los
  otros dos: la migración que lo haga tiene que decidirlo para cada rol.
- **`portal.acceso.administrar` no se evalúa sobre un ticket** (`PORTAL_ACTIONS` en
  `catalog.ts`): `requireTicketAction` no la acepta, y su `TOTAL` significa «cualquier
  cliente».
- Asignar el rol es una actualización de `core.dim_personal.rol_aplicacion` por `psql`,
  hasta que exista la consola de administración (§8, entrega 6).

### 4.3 `DECISIÓN` (28-sep-2026, U10) Salud de la aplicación

Construido en `20260928130000_observabilidad`, sin desplegar.

| Acción | `AGENTE` | `CLASIFICADOR` | `ADMIN` |
|---|---|---|---|
| `salud.consultar` | — | — | `TOTAL` |
| `salud.divergencia.revisar` | — | — | `TOTAL` |

- **Dos acciones y no una:** mirar la salud no es lo mismo que dar por atendida una
  divergencia con PowerApps. Hoy las tiene el mismo rol; separarlas después no exige
  cambiar código, solo reglas.
- **No se evalúan sobre un ticket** (`SALUD_ACTIONS` en `catalog.ts`): `TOTAL`
  significa «toda la aplicación».
- Marcar revisada entra solo por `helpdesk.marcar_divergencia_revisada`:
  `coraje_runtime` no tiene `UPDATE` sobre `sync_divergencia` (`specs/observabilidad.md`
  §4).

### 4.4 `DECISIÓN` (28-sep-2026, U11) Seguimiento del ticket

Construido en `20260928150000_seguimiento_ticket`, sin desplegar. Las tres acciones
se siembran igual para los tres roles (copia, no herencia: §4.2).

| Acción | `AGENTE`, `CLASIFICADOR` y `ADMIN` |
|---|---|
| `ticket.observador.gestionar` | `AREA` |
| `ticket.validacion.solicitar` | `AREA` |
| `ticket.solicitante.comentar` | `PROPIO` |

- **Ser observador amplía una sola cosa: consultar.** `scope.ts` lo cuenta como
  «propio» para `ticket.consultar` y para nada más, y le da la historia del equipo
  (`EQUIPO`), como pide `specs/tickets.md` §11. `scope.test.mts` recorre el catálogo
  entero sobre un ticket que la persona solo sigue: ninguna acción (V7).
- **`PROPIO` de `ticket.solicitante.comentar` es haberlo radicado**, la única acción
  cuyo «propio» no es ser el responsable. La base lo vuelve a exigir en el escritor.
- **Solicitar validación no pasa por la autorización excepcional** (§5): sin
  justificación obligatoria ni auditoría de excepción. Es un comando ordinario con su
  propia acción (V8).
- **Elegir observadores al crear va bajo `ticket.crear`**, no bajo gestionar: quien
  pide ayuda decide a quién le interesa, y después de radicar no gestiona el ticket.
- Solo personas activas con rol pueden seguir o validar (`follow-rules.ts`): sin rol
  no pueden entrar. Se comprueba que el rol exista, no cuál es.

### 4.5 `DECISIÓN` (30-sep-2026) `COLABORADOR` y visibilidad por recepción

Construido en `20260930100000_rol_colaborador`, sin desplegar. Decisión del usuario:

- **`AGENTE` pasa a llamarse `COLABORADOR`.** Era un valor provisional de U3, no un
  rol del legacy: PowerApps no tenía roles, el permiso salía de la relación con el
  ticket y de la lista `RecibeHelpdesk` (`legacy/reglas-negocio-powerapps.md` §6, §10).
  Las reglas no cambian (§4.1, §4.4); `CLASIFICADOR` y `ADMIN` siguen siendo copias.
- **`AREA` significa «lo que recibo», no «el área a la que pertenezco».** Una persona
  recibe los tipos cuyo responsable resuelto es ella —la regla del tipo o, sin
  regla, el encargado de recepción del área— y, para los tickets sin tipo, las áreas
  que encarga. Es la regla de `helpdesk.resolver_responsable_tipo`, leída de las
  tablas (`authorization/recepcion.ts`). Quien no recibe nada ve solo lo suyo.
- **Por qué no un rol «ve toda su área»:** con los datos del 30-sep, la encargada de
  ADMINISTRACIÓN-RECEPCIÓN pertenece a ADMINISTRACIÓN, y los responsables de
  «proyectos y ti» pertenecen a ADMINISTRACIÓN sin recibir el resto del área. Un rol
  sobre el área de la persona habría mostrado el área equivocada, y habría duplicado
  un dato que ya vive en el enrutamiento.
- **`ADMIN` consulta todos los tickets** (`ticket.consultar` `TOTAL`). Solo consultar:
  actuar sigue exigiendo ser el responsable.
- **El área de la persona** sigue decidiendo a quién puede reasignar, como en el
  legacy.

### 4.6 `DECISIÓN` (30-sep-2026, U15) Avisos

Construido en `20260930120000_avisos_ticket`, sin desplegar. Una acción nueva,
`aviso.consultar`, con alcance `PROPIO` para `COLABORADOR`, `CLASIFICADOR` y `ADMIN`
(copia, no herencia: §4.2). La exigen la campana, la página `/avisos`, su ruta y sus
acciones. `PROPIO` no se evalúa sobre un ticket: significa que toda consulta filtra por
destinatario, así que nadie ve ni marca avisos ajenos (`specs/tickets.md` §12).

La ruta del escalamiento (`/api/interno/avisos/escalar`) no pasa por el autorizador:
no la llama una persona sino n8n, y su credencial es un secreto en cabecera
(`public-paths.ts`).

## 5. Autorización excepcional

Una acción fuera del alcance ordinario —intervención administrativa, acceso
organizacional— **exige justificación escrita antes de ejecutarse**, y audita actor,
permiso, recurso, alcance, justificación, fecha y resultado.

Dos reglas que evitan que la excepción se vuelva rutina:

- **La justificación no se persiste como autorización.** Viaja con la acción y se audita
  contra ella. Una justificación que sobreviviera a la visita dejaría que una sesión
  posterior heredara un motivo que nadie escribió para ella.
- **La interfaz conserva lo escrito** mientras pide la justificación. Perder el trabajo
  por pedir un motivo enseña a evitar el motivo.

## 6. `RATIFICADO (parcial)` Los roles reales

Impulsa tiene Staff, Senior, Gerente, Socio y Admin, derivados de la estructura de una
firma de auditoría. **No se importan.** Una mesa de ayuda tiene otra forma, y el
esquema actual insinúa —sin definir— al menos tres figuras:

| Indicio en el esquema | Figura que sugiere |
|---|---|
| `core.dim_area.encargado_recepcion` | Alguien recibe lo que llega a un área |
| `helpdesk.routing_rule.encargado_interno` | Alguien queda como responsable por tipo de requerimiento |
| El módulo `/redireccion` completo | Alguien reparte lo que entra sin clasificar |

Ninguno de los tres es un rol declarado: son columnas de texto y una ruta.

**Confirmado (03-sep-2026), sin levantamiento formal de PowerApps — directamente por el
usuario.** El legacy solo se apartaba de la tabla de enrutamiento normal en dos casos
(`legacy/reglas-negocio-powerapps.md` §5, §11): `alexbolanos@rbcol.co` para
`PROYECTOS Y TI` y Jimena Tejeiro para `LEGAL`. Los dos siguen vigentes, y **ninguno
tiene ningún poder adicional** sobre el que ya sugiere la segunda fila de la tabla:
son la persona responsable de su área, nada más. No aprueban lo que otros no aprueban,
no ven lo que otros no ven. **La segunda figura (`encargado_interno`) es, hasta donde
hay evidencia, la única real.**

> **Lo que esto confirma y lo que no.** Son los dos únicos casos que el código legacy
> trataba distinto de las demás siete áreas —si alguna otra área tuviera una figura con
> más poder, es razonable esperar que también hubiera necesitado su propio caso especial
> en el código, y no se encontró ninguno más en la lectura completa de las nueve
> pantallas. Aun así, esto **no descarta** que aparezca un matiz al construir (una
> aprobación cruzada entre áreas, por ejemplo): confirma la ausencia de evidencia, no
> una garantía exhaustiva. Si aparece algo así, se nombra explícitamente cuando ocurra,
> no se asume ahora por analogía.

> `RIESGO` `core.dim_personal` **no tiene columna de rol de aplicación** y se alimenta
> desde SharePoint por el ELT. Ver `specs/acceso-empleados.md` §7.1: el mismo hueco
> bloquea la admisión y la autorización, y se resuelve una sola vez.

## 7. Criterios de aceptación

- No existe **ninguna** comparación de rol fuera del autorizador, verificado por
  búsqueda sobre `src/`.
- Cada acción del catálogo está conectada al autorizador **en servidor**, no solo
  presente en una tabla.
- Existe **prueba negativa** por cada frontera que importa: el rol que no puede
  responder al cliente no puede hacerlo tampoco invocando el *server action* directo.
- La autorización excepcional exige justificación **antes** de ejecutar, y el orden se
  verifica.
- Un permiso presente en el catálogo pero no consultado por ningún servicio **se detecta
  como tal**: presencia en el catálogo no es autorización aplicada.

## 8. Orden de implementación

| # | Entrega | Depende de |
|---|---|---|
| 1 | Levantamiento de roles reales | `specs/tickets.md` §2 |
| 2 | Columna de rol en el directorio | 1, `specs/acceso-empleados.md` §7.1 |
| 3 | Catálogo de acciones y autorizador ejecutable | 2 |
| 4 | Conectar cada acción del ciclo del ticket | 3, `specs/tickets.md` |
| 5 | Autorización excepcional con justificación y auditoría | 4 |
| 6 | Consola de consulta de la matriz | 5 |

---

## 9. Verificación contra código

| # | Afirmación a verificar | Dónde comprobarlo | Veredicto (26-sep-2026) |
|---|---|---|---|
| V1 | No hay comparaciones de rol fuera del autorizador | `grep` sobre componentes, handlers y servicios | **Verificado por prueba**: `authorization/catalog.test.mts` |
| V2 | Cada acción del catálogo se consulta en servidor antes de ejecutar | Guards de cada servicio | **Verificado por prueba**: cada código se consulta en algún servicio; los comandos autorizan dentro de su transacción, con la fila bloqueada |
| V3 | Pruebas negativas por frontera de rol | Tests de autorización | **Parcial**: `scope.test.mts` prueba las fronteras de alcance sin base. Sin ejercitar contra la base |
| V4 | La justificación se exige antes de ejecutar, no después | Orden de validación en el handler excepcional | Sin construir (§5) |
| V5 | La auditoría registra los siete campos de §5 | Modelo y escritura | Sin construir (§5) |
| V6 | La interfaz y el servicio comparten frontera de estados | Comparar condición de la vista con la del servicio | **Por inspección**: `getTicketDetail` usa las mismas reglas de alcance y de estado que los comandos |
| V7 | Un observador no puede ejecutar ninguna acción del catálogo | Guard del servicio + prueba negativa | **Verificado por prueba** (corte 22): `scope.test.mts`, «seguir un ticket no da ninguna acción sobre él». Sin ejercitar contra la base |
| V8 | Solicitar validación no exige la justificación obligatoria de §5 | Comparar los dos handlers | **Por inspección** (corte 22): `requestValidation` es un comando ordinario; §5 sigue sin construir |
| V9 | Quien recibe un ticket nuevo lo ve en su bandeja (§4.5) | `recepcion.ts` frente a `resolver_responsable_tipo` | **Verificado por prueba** (corte 24): `recepcion.contract.test.mts` exige la misma expresión; `scope.test.mts` cubre recepción, excepción por tipo y colaborador sin recepción. Sin ejercitar contra la base |

## 10. `DECISIÓN` Observadores y solicitud de validación — construidos (§4.4)

```
FUENTE:  prototipo funcional (`helpdesk_santi/`), confirmado por el usuario para v1
         (03-sep-2026). Detalle funcional completo en `specs/tickets.md` §11 — este
         documento solo fija lo que le corresponde: permiso y alcance.
```

- **Observador: alcance de solo lectura, sin permiso de acción.** Ve el ticket bajo la
  misma regla de `visibilidad` que un agente interno (`specs/tickets.md` §6), pero el
  catálogo de acciones (§3) no le concede ninguna entrada. Añadir/quitar observador es
  una acción propia, sujeta al alcance ordinario de §4 (¿tiene permiso sobre el área o
  cliente del ticket?), no un efecto secundario de otra acción.
- **Solicitar validación no es autorización excepcional (§5) y no debe tratarse con su
  mismo mecanismo.** No exige justificación obligatoria ni auditoría de excepción — es
  un paso ordinario del catálogo, con su propio permiso. Confundir los dos mecanismos
  al construir volvería trivial la excepción de §5: cualquier "pedir confirmación"
  quedaría disfrazado de intervención administrativa.
- **Ambas acciones comparten el mismo bloqueo que §6 ya declara `ABIERTO`.** Dirigir un
  evento a "Jefe de área" o a "Administrador del sistema" —como hace el prototipo—
  exige saber a qué persona real corresponde ese puesto hoy. Sin catálogo de
  roles/puestos, la única alternativa honesta en v1 es dirigir observadores y
  solicitudes de validación a personas reales de `core.dim_personal` elegidas una por
  una, no a una etiqueta de rol. Formalizar el catálogo de puestos queda fuera de esta
  decisión.

**Changelog:** 03-sep-2026 — línea base. Adopta el modelo de autorizador ejecutable de
Impulsa y la separación «quien prepara no expone» (§3); declara que los roles reales
están bloqueados por el levantamiento de PowerApps y que no se importan los de Impulsa
(§6).
- 03-sep-2026 (mismo día) — añade dos acciones al catálogo (§3) y §10: Observadores y
  solicitud de validación, confirmados para v1. Distingue explícitamente solicitud de
  validación de la autorización excepcional (§5) para que no se construyan como el
  mismo mecanismo.
- 03-sep-2026 (mismo día) — §6 pasa de `ABIERTO` a `RATIFICADO (parcial)`: el usuario
  confirma directamente, sin levantamiento formal de PowerApps, que las dos únicas
  excepciones del legacy (Alex, Jimena) no cargan ningún rol adicional — son
  `encargado_interno` de su área, sin más. Queda declarado qué tanto puede sostener esta
  confirmación y qué no.
- 28-sep-2026 — U11 (corte 22). §4.4: tres acciones de seguimiento para los tres
  roles; ser observador amplía solo la consulta. V7 verificado por prueba y V8 por
  inspección. §10 pasa de propuesta a decisión construida.
- 30-sep-2026 — U15 (corte 28). §4.6: `aviso.consultar` con alcance `PROPIO` para los
  tres roles.

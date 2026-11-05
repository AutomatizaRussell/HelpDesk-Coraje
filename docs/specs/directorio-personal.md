# Directorio de personal sin la lista «Personal GCT»

```
ESTADO:      §4.3 (atribución congelada) y el saneamiento de correos de la 03
             CONSTRUIDOS en U36, SIN DESPLEGAR. El resto de §4 es propuesta: D1,
             D2, D3, D4 y D5 decididas el 05-nov-2026 (§8); fases A4-A6, B, C y D
             sin construir
CORTE:       05-nov-2026 (corte 74), sobre eb126d3
EVIDENCIA:   lectura de código (`employee-admission.ts`, `employee-session.ts`,
             `ticket-queries.ts`, `ticket-commands.ts`, `schema.prisma`), de las
             Transform 03, 04 y 06 del workflow de ingesta, y del modelo
             `DatosEmpleado` de Conecta en `origin/main` 62e8518 (solo lectura).
             SIN consulta a la base ni a Entra: lo que depende de datos va en §3
             como inferencia, con la consulta que lo confirma
```

**Autoridad:** si se aprueba, este documento es dueño de qué fuente decide cada dato de
una persona. `acceso-empleados.md` sigue siendo dueño del ingreso y la sesión;
`tickets.md` §7.3–§7.4, de la atribución de los tickets legacy. Decisión de partida del
usuario (04-nov-2026): la lista debe ser lo último de lo que se dependa.

## 1. Veredicto

1. **La llave no hay que migrarla.** Todos los tickets, eventos y avisos apuntan a
   `id_personal` (uuid propio). `sp_personal_id` solo es la llave del `UPSERT` de la
   Transform 03. Cambiar quién alimenta el directorio no toca ni una clave foránea.
2. **El riesgo real sobre la atribución está en otro sitio:** la Transform 06 recalcula
   `id_solicitante` e `id_asignado` de **todos** los tickets legacy en cada ejecución, a
   partir del correo de `dim_personal` y de la fecha `Created` de los ítems de la lista.
   La atribución histórica es hoy una función viva de la lista: un error en «Personal
   GCT» reescribe tickets pasados. Eso es lo primero que hay que cortar.
3. **El ingreso puede dejar de depender de la lista sin esperar a Graph ni a Conecta.**
   Que la cuenta exista y esté habilitada ya lo prueba Entra en cada ingreso: una cuenta
   deshabilitada no obtiene `id_token`. Lo que la lista aporta hoy a la admisión es el
   correo de arranque y `estado_activo`. Ambas cosas pueden pasar a datos de HelpDesk.
4. **La sincronización con Graph aporta poco a la admisión.** Acorta como mucho las 8 h
   en que una sesión abierta sobrevive a una cuenta deshabilitada y precarga el `oid` de
   quien no ha entrado. No es lo que sostiene la robustez y no debe bloquear nada.

## 2. Hechos verificados

| # | Hecho | Dónde |
|---|---|---|
| H1 | Toda relación con una persona usa `id_personal`; `sp_personal_id` es `@unique` y solo lo usa la 03 en `ON CONFLICT` | `schema.prisma` (`DimPersonal` y sus 25 relaciones); Transform 03 §4 |
| H2 | La 06 resuelve correo → persona con intervalos de ocupación calculados en cada ejecución desde `dim_personal` y `staging.sp_personal_gct_raw.Created`, y hace `ON CONFLICT DO UPDATE SET id_solicitante, id_asignado` sobre todo ticket con `origen_sistema = 'SHAREPOINT_LEGACY'` | Transform 06, secciones −1 y 1 |
| H3 | La admisión busca por `oid`; si no hay enlace, por correo entre filas activas sin enlace. En cada petición relee `estado_activo` y `rol_aplicacion`. `estado_activo`, `correo_corporativo`, `nombre_completo`, `id_area` y `cargo` los escribe la 03 desde la lista | `employee-admission.ts`, Transform 03 |
| H4 | Reasignar y añadir observadores exige `estado_activo` y rol. **El directorio operativo de HelpDesk son las personas con rol**; las demás filas solo sirven para atribuir tickets legacy | `listReassignCandidates`, `FOLLOWER_WHERE` |
| H5 | La 03 solo trata como ausente el correo vacío. `"."` entra como correo válido y ocupa el índice `ux_dim_personal_correo_activo` | Transform 03 §1 |
| H6 | El ingreso de HelpDesk usa la App Registration «GCT - Conecta RBG», compartida con Conecta; su secreto vive en Conecta, en Coolify de HelpDesk y en n8n | `estado/operacion.md`, «Consecuencia de compartir la App Registration» |
| H7 | En Conecta, `DatosEmpleado` tiene `id_empleado` estable, `correo_corporativo` **único**, `estado` (`ACTIVA`/`INACTIVO`), `fecha_ingreso`, `fecha_retiro`, área y cargo. **No guarda el `oid` de Entra**: `auth_id` existe pero ningún código lo escribe | RBGCT-REACT `backend/empleados/models/empleado.py` en 62e8518 |

> **Discrepancia resuelta (05-nov-2026):** hay 3.088 tickets reales (§3). El 2.313 de
> `CLAUDE.md` es el conteo de la migración inicial y está desactualizado.

## 3. Lo que mostró la base (05-nov-2026)

Consultas C1–C3 corridas por el usuario en la VPS, en modo de solo lectura.

- **Tickets reales: 3.088**, todos de SharePoint. Los 2 creados en HelpDesk
  (`SISTEMA_INTERNO`) son de prueba.
- **9 personas con rol**, 2 de ellas enlazadas a Entra. Las 9 tienen un correo válido.
- **Ítem 405 (Alizon):** fila creada el 26-oct, correo `"."`, activa, sin rol y sin
  enlace. Hoy el ingreso no le afecta.
- **Ítem 311 (Juliana):** su correo en la lista es ahora `mercadeo.gct@`, no
  `mercadeo.mde@` como recoge `tickets.md` §7.4 el 23-oct. No hay forma de fechar el
  cambio: la 03 reescribe `updated_at` en cada ejecución y el staging solo guarda el
  estado actual del ítem.
- **Nadie en la lista tiene ya `mercadeo.mde@`.** El 29-oct la Transform 04 creó la
  fila `MERCADEO.MDE` con el marcador histórico, porque esa transform marca toda fila
  que crea para un correo de ticket que no está en `dim_personal`. Desde entonces, el
  marcador cubre los **7 tickets** de ese correo: 5 como solicitante (04-jun-2025 a
  15-sep-2026) y 2 como responsable (17-jun-2025 a 31-jul-2026).
- **H2, confirmado con un caso real.** Según §7.4, Juliana ocupaba `mercadeo.mde@`
  desde el alta de su ítem (19-may-2025) hasta la de Alizon (13-oct-2026), y los 7
  tickets caen en ese intervalo. Bastaron dos ediciones en la lista para que pasaran de
  ella a «responsable no identificado» sin que nadie lo decidiera. No quedaron
  atribuidos a otra persona: fue un fallo cerrado, pero se perdió información correcta.
- **Segundo mecanismo, que §4.3 tiene que cerrar:** cuando a alguien le cambian el
  correo en la lista, la 04 crea un marcador para el correo viejo y ese marcador se
  queda con todo su historial. La fila `MERCADEO.GCT` (marcador del 04-jun-2026) es
  anterior a este caso y cubre 3 tickets entre 2024 y 2025.
- Un segundo ítem con `"."` chocaría con el índice y pararía la ingesta, como pasó el
  13-oct. Está deducido de H5, no observado.

**Dos personas con `mercadeo.mde@` en Teams.** En Conecta no puede ser: el correo es
único (H7). En Exchange, una misma dirección SMTP no puede estar en dos destinatarios.
Las explicaciones compatibles son una cuenta de buzón más un contacto, un grupo o una
lista de distribución, o un nombre en caché de un ocupante anterior. Se comprueba en
Graph Explorer con la cuenta propia (§9, C4).

## 4. Propuesta

### 4.1 Principio

> **`INVARIANTE` Las fuentes externas solo pueden quitar acceso, nunca concederlo.
> Conceder es un acto de HelpDesk: asignar rol a una cuenta concreta. La admisión
> solo lee PostgreSQL.** Graph, Conecta y la lista escriben en tablas propias de
> forma diferida. Si una cae, se usa el último estado conocido y el ingreso no se
> entera.

### 4.2 Dueño de cada dato

| Dato | Dueño | Cómo llega | Uso |
|---|---|---|---|
| Persona (`id_personal`) | HelpDesk | Ya existe | Clave de todo; no cambia |
| `entra_object_id` | Entra | Primer ingreso, o la sincronización de Graph (§4.6) | Llave natural de la persona |
| Correo de acceso | HelpDesk, fijado por quien concede el rol | Al conceder; se confirma con el `preferred_username` del token | Único correo que puede enlazar un `oid` |
| Cuenta habilitada o borrada | Entra | Sincronización de Graph | Señal negativa |
| Nombre visible | Entra (claim `name`) hasta que exista Conecta; luego Conecta | Cada ingreso; luego la sincronización con Conecta | Mostrar |
| Cargo, alta, baja | Conecta | Endpoint (§4.7) | Cargo: mostrar. Baja: señal negativa |
| Área de la persona | Conecta; mientras no exista su endpoint, la lista | Endpoint (§4.7) | Hecho organizativo |
| Traducción de área de Conecta a área de HelpDesk | HelpDesk (§4.10) | Tabla versionada | Autoriza: reasignación, recepción |
| Rol | HelpDesk | Se concede a mano | Concede |
| Ítem de la lista, su correo y su estado | La lista, solo mientras viva PowerApps | Transform 03, en tabla propia | Atribuir tickets de PowerApps. Estado inactivo: señal negativa transitoria |

**Separación física.** La 03 deja de escribir en `dim_personal` y pasa a escribir en
`core.personal_lista` (una fila por ítem, con `id_personal`). Lo mismo harán
`core.personal_entra` y `core.personal_conecta`. Cada fuente es dueña de su tabla
completa y nadie pisa columnas ajenas. El enlace de cada fila de fuente con
`id_personal` se hace con reglas explícitas en SQL (§4.4 y §4.6). Ninguna fuente borra
filas de `dim_personal`.

### 4.3 Congelar la atribución histórica — construido en U36 (05-nov-2026), sin desplegar

1. Tabla `core.personal_correo_ocupacion (correo, id_personal, desde, hasta, origen)`
   (migración `20261105100000_ocupacion_correo_personal`). Los extremos abiertos se
   guardan como `NULL` porque Prisma no representa `infinity`. La migración no puede
   sembrarla, porque `coraje_migrator` no lee `staging`. La siembra la hace la 06 la
   primera vez que ve cada correo, con la regla de §7.3–§7.4.
2. La 06 deja de calcular intervalos y lee esa tabla.
3. La tabla solo crece. Cuando cambia el ocupante activo de un correo, la 06 cierra el
   intervalo abierto y abre otro **desde ese momento**, no desde el alta del ítem. El
   trigger `trg_guardar_personal_correo_ocupacion` rechaza borrar, editar un intervalo
   cerrado y solapar dos. Corregir uno es una migración con causa. El intervalo
   abierto de un marcador histórico no se releva: §7.3 sigue igual.
4. Con eso, un error en la lista (un `"."`, un ítem borrado o un correo cambiado) solo
   afecta a los tickets que lleguen después, y queda en la salida de la 03.
5. La 04 deja de crear marcadores para correos que ya tienen intervalos en la tabla.
   Solo los crea para correos que nunca tuvieron dueño conocido.

**Salida de la 06** desde U36: `ocupacion_sembrada`, `relevos_correo` y
`atribucion_cambiada_total`/`atribucion_cambiada`, que lista los tickets legacy que
cambiaron de persona en la ejecución. **Validación de la primera ejecución:** solo
deben aparecer los tickets de `mercadeo.mde@`, más alguno reasignado en PowerApps desde
la ejecución anterior. Cualquier otro es un defecto de la siembra y se explica antes de
seguir (`estado/operacion.md`, «Ocupación de correos (U36)»).

**`DECISIÓN` (05-nov-2026, D4): reconstruir.** La migración escribe los intervalos de
`mercadeo.mde@` que daba la regla de §7.4 antes de las ediciones de la lista:
Juliana desde siempre hasta el 2026-10-13T18:31:39Z, y Alizon desde entonces. La 06
devuelve los 7 tickets a Juliana en su siguiente ejecución. La fila `MERCADEO.MDE` del
29-oct se conserva sin tickets: borrarla es una operación destructiva que no aporta
nada.

### 4.4 Admisión nueva

| Paso | Regla |
|---|---|
| Buscar | Por `oid`. Si no hay fila enlazada: por **correo de acceso** igual a `preferred_username`, entre filas con rol y sin enlace. Nunca por el correo de la lista |
| Enlazar | Igual que hoy: solo si la fila no tiene enlace (V4). Mover un enlace es una operación administrativa auditada, nunca efecto de una petición ni de una sincronización |
| Admitir | Rol no nulo **y** ninguna señal negativa vigente |
| Señales negativas | Entra: deshabilitada o borrada. Conecta: `INACTIVO` o `fecha_retiro` ≤ hoy. Lista, solo hasta que exista Conecta: ítem inactivo. Cada una produce su causa (`CUENTA_DESHABILITADA`, `RETIRADO`). **Bloquean sin quitar el rol** (D3): si la fuente corrige el error, la persona vuelve a entrar sin reasignar nada. Cada bloqueo nuevo avisa a Teams. A una cuenta de cargo (§4.9) solo le aplican las de Entra |
| Ausencia de dato | Una fuente que nunca ha respondido **no** es señal negativa: el token ya prueba que la cuenta vive |

Se mantiene la relectura en cada petición (`readEmployeeSession`), ahora sobre
`dim_personal` más la vista de señales negativas. Es una sola consulta indexada por
`id_personal`, sin llamadas externas.

**Transición de datos (no destructiva):** el correo de acceso se rellena desde
`correo_corporativo` en las filas con rol y sin `oid` que tengan un correo válido. Las
que no lo tengan se listan para corregirlas a mano. `estado_activo` se conserva como
columna derivada y deja de escribirla la 03, para no romper las consultas de H4.

### 4.5 Quien nunca ha iniciado sesión

- **Sin rol:** fila que solo existe para atribuir tickets legacy. No entra y no aparece
  en selectores (H4 no cambia).
- **Con rol y sin `oid`:** se puede asignar y seguir. Entra la primera vez por correo de
  acceso. Si Graph está construido, el `oid` llega antes por la sincronización y el
  correo de acceso deja de importar.
- **Persona nueva tras retirar la lista:** el alta la hace quien concede el rol, con
  nombre, correo de acceso, área y rol. Mientras conviva la lista, la 03 adopta esa fila
  si un ítem nuevo trae el mismo correo y la fila no tiene `sp_personal_id`. Si hay
  ambigüedad, no adopta y lo reporta.

### 4.6 Sincronización con Graph (bajo demanda, sin proceso permanente)

- **App Registration dedicada**, por ejemplo «HelpDesk - Directorio», con `User.Read.All`
  **de aplicación** y consentimiento de administrador. **No** en «GCT - Conecta RBG»
  (H6): concederlo allí da lectura de todo el tenant a quien tenga ese secreto, que vive
  en tres sitios y en otra aplicación. Mejor con certificado que con secreto.
- **Alcance mínimo: solo las personas con rol.** Una vez al día, un `Schedule` de n8n
  pide `$batch` de `GET /users/{oid}?$select=id,accountEnabled,userPrincipalName,mail,displayName`
  (20 por lote). Las filas con rol y sin `oid` se resuelven con
  `GET /users?$filter=userPrincipalName eq '<correo de acceso>'`. Solo se enlaza si hay
  exactamente un resultado.
- **Por qué no `/users/delta` del tenant:** traería a todas las oficinas, buzones y
  salas, y obliga a guardar el `deltaLink`. HelpDesk no necesita a quien no tiene rol
  (H4). Solo se justifica si algún día hace falta el padrón completo.
- **Fronteras:** n8n pide y escribe la respuesta cruda en `staging.entra_usuario_raw`.
  Una función SQL la transforma en `core.personal_entra`. Un `404` de Graph se registra
  como borrada.
- **Carga:** con N personas con rol, ⌈N/20⌉ peticiones al día. Hay que medir N (§9, C1).

### 4.7 Contrato que habría que pedir a Conecta

El endpoint de U5.2 no sirve: consulta una persona, oculta a los inactivos y devuelve
datos de la barra lateral. Hace falta otro, con los **mismos controles de
`integracion-conecta.md` §5.1** y un alcance propio:

```
POST /api/integraciones/helpdesk/personal/consulta     alcance: helpdesk.directorio
Cabecera:  X-HelpDesk-Key (clase de autenticación nueva, no ApiKey de SuperAdmin)
Cuerpo:    { "correos": ["a@rbcol.co", …] }            máx. 100, minúsculas
Respuesta: { "personas": [ {
             "correo", "id_empleado", "estado": "ACTIVA"|"INACTIVO",
             "fecha_ingreso", "fecha_retiro",
             "primer_nombre", "primer_apellido",
             "area": { "id", "nombre" }, "cargo" } ],
             "desconocidos": ["…"] }
```

- **Por correos y no por padrón:** HelpDesk solo pregunta por las personas con rol. Con
  la clave filtrada no se enumera el personal; como mucho se confirma lo que ya se
  conoce.
- **Sí devuelve a los inactivos.** A diferencia de U5.2, aquí la baja es el dato que se
  busca. Es más exposición, acotada por la lista de correos, el límite propio y el
  registro de cada uso.
- **`id_empleado` como llave estable del lado de Conecta**, porque el correo puede
  cambiar. HelpDesk lo guarda en `core.personal_conecta` y, desde el primer cruce, busca
  por él.
- **Pregunta abierta al equipo de Conecta:** si `auth_id` podría guardar el `oid` de
  Entra. Con eso el cruce sería por llave inmutable de punta a punta.
- Lo llama n8n, una vez al día, después de Graph. Va por `lulox`, con diff aprobado y PR.

### 4.8 Si Conecta o Graph no responden

| Situación | Efecto |
|---|---|
| Graph caído o credencial vencida | Ninguno sobre el ingreso. Las señales de Entra quedan con su última fecha. Quien sea deshabilitado en Entra no puede abrir sesión nueva igualmente |
| Conecta caído o lento | Ninguno sobre el ingreso. Nombre y cargo, los últimos conocidos. Una baja nueva no se ve hasta que vuelva |
| Fuente sin responder más de 72 h | La revisión diaria (`HELPDESK - Salud diaria`) lo marca como hallazgo y avisa a Teams |
| Respuesta parcial o mal formada | Se descarta el lote completo y se registra. Una respuesta vacía **no** se interpreta como «todos dados de baja» |
| Graph responde `404` en masa | Si más del 20 % de los consultados sale borrado, se aborta sin aplicar (umbral a validar) |

### 4.9 Cuentas de cargo tipo `mercadeo.mde@` — `DECISIÓN` (05-nov-2026, D1)

**Se admiten como cuentas de cargo.** Una cuenta de Entra cuya contraseña pasa de un
ocupante a otro es una identidad del cargo, no de una persona, y HelpDesk la modela así:

- **Fila propia en `dim_personal`**, con `tipo_cuenta = CARGO`, nombre del cargo,
  correo de acceso del buzón, su `oid` y su rol. Las filas de las personas que lo
  ocuparon siguen existiendo para la atribución legacy, pero ninguna se enlaza a ese
  `oid`.
- **Lo que hace la cuenta se atribuye al cargo.** El registro de eventos no puede decir
  qué ocupante actuó, y la interfaz no lo aparenta.
- **Señales:** solo las de Entra. Conecta describe personas, y su baja o su área no
  corresponden a un cargo. El área de una cuenta de cargo se fija en HelpDesk; es la
  única excepción a §4.10.
- **Relevo:** cuando cambia el ocupante, HelpDesk revoca todas las sesiones de la
  cuenta. Cambiar la contraseña es trabajo de TI y HelpDesk no puede exigirlo.
- **Ya enlazada a una persona** (riesgo de `tickets.md` §7.4): se mueve el `oid` a la
  fila del cargo con la operación auditada de §4.4.

**Costo aceptado:** no hay revocación individual ni atribución a una persona. Quien deja
el cargo conserva el acceso mientras la contraseña no cambie.

La atribución legacy de los buzones de cargo no cambia: la resuelven los intervalos de
ocupación (§4.3).

### 4.10 Área: de Conecta, traducida por HelpDesk — `DECISIÓN` (05-nov-2026, D2)

El área en que trabaja una persona es un hecho organizativo y lo decide Conecta, como
hoy lo decide la lista. HelpDesk no puede ser dueño de ese hecho. Lo que sí le
corresponde es **cómo se traduce un área de Conecta a un área de HelpDesk**, porque las
dos listas no son la misma. Ya pasa hoy: la 03 traduce «Proyectos y TI» de la lista a
«Administración».

- **Tabla versionada `core.area_equivalencia`** (área de origen → `id_area`), que hereda
  la traducción que hoy está escrita dentro de la 03. Cambiarla es una migración.
- **Un área de origen sin traducción no se adivina.** La persona queda sin área en
  HelpDesk: no puede reasignar ni recibe por recepción, y se avisa a Teams. Falla
  cerrado, igual que la 01 con un área desconocida.
- **Un cambio de área en Conecta cambia los permisos en la siguiente sincronización** y
  queda avisado. Es lo que pasa hoy con la lista.
- **Mientras no exista el endpoint de Conecta,** la fuente sigue siendo la lista, con la
  misma tabla.

## 5. Riesgos y escenarios de fallo

| Riesgo | Escenario | Mitigación |
|---|---|---|
| Duplicar a una persona | Alta en HelpDesk y después un ítem nuevo en la lista con otro correo | La 03 solo adopta por correo exacto. Lo demás se reporta y se enlaza a mano. Contar duplicados en la revisión diaria |
| Perder una señal de baja en la transición | Se deja de leer el estado de la lista antes de que exista Conecta | El ítem inactivo sigue siendo señal negativa hasta que Conecta esté en producción (§4.4) |
| Conceder de más por correo de acceso mal escrito | El admin escribe el correo de otra persona | Antes de enlazar se compara el `name` del token con el de la fila. Si difieren, se avisa sin bloquear. Toda concesión queda auditada |
| `oid` enlazado a quien se fue (tickets.md §7.4) | El buzón de cargo ya tiene enlace con la persona anterior | Mover el `oid` a la fila del cargo (§4.9) con la operación auditada de §4.4 |
| Ocupante saliente de una cuenta de cargo | Deja el cargo y conserva la contraseña | Revocar las sesiones en el relevo. El resto depende de que TI cambie la contraseña (costo aceptado en D1) |
| Conecta bloquea una cuenta de cargo | Su correo pertenece en Conecta a una persona que se retira | A las cuentas de cargo no se les aplican señales de Conecta (§4.9) |
| Credencial de Graph con lectura del tenant | Filtración del secreto | App dedicada y certificado. Permiso de solo lectura. Rotación en `operacion.md` |
| El área de Conecta cambia permisos | Recursos humanos mueve a alguien y cambia lo que puede reasignar | Es el comportamiento buscado (D2). Cada cambio se avisa. Un área sin traducción deja a la persona sin área, nunca en una adivinada |
| El equipo de Conecta no acepta o tarda | Sin endpoint, sin señal de baja de Conecta | El diseño funciona sin él (§6, fases A y B). Mientras tanto, la baja la cubren Entra y la lista |
| Siembra de §4.3 con datos ya contaminados | El `"."` ya reatribuyó tickets | §8 D4 y comprobación C3 antes de sembrar |

## 6. Qué se puede construir ya

**Fase A, sin Graph ni Conecta:**
1. **Construido (U36).** Sanear la 03: un correo que no cumpla el patrón entra como
   ausente y se reporta en `correos_invalidos`.
2. **Construido (U36).** §4.3: tabla de ocupación que solo crece, reconstrucción de
   `mercadeo.mde@`, la 06 leyéndola y la 04 sin marcadores para correos con dueño.
3. `core.personal_lista`, separada de `dim_personal`. La 03 deja de escribir en las
   columnas de identidad.
4. Correo de acceso, nueva búsqueda de arranque, señales negativas con causa y nombre
   visible desde el claim `name`.
5. Operación auditada para conceder rol, dar de alta, mover un enlace y revocar las
   sesiones de una cuenta. Por `psql` con función SQL si no hay pantalla.
6. `tipo_cuenta` (`PERSONA`/`CARGO`) y `core.area_equivalencia`, sembrada con la
   traducción que hoy vive dentro de la 03.

**Fase B, con la credencial de Graph:** `staging.entra_usuario_raw`,
`core.personal_entra`, workflow diario y señal de cuenta deshabilitada.

**Fase C, con el endpoint de Conecta:** `core.personal_conecta`, señal de baja y nombre y
cargo oficiales. Al entrar en producción, el estado de la lista deja de ser señal.

**Fase D, al apagar PowerApps:** se apagan la 03 y la 06. `core.personal_lista` y la
tabla de ocupación quedan congeladas como histórico.

## 7. Lo que esta propuesta no hace

- No borra ni fusiona filas de `dim_personal` ni toca claves de tickets.
- No escribe en Conecta ni lee su base.
- No concede rol en bloque (memoria del 29-sep: el rol es el filtro de ciudad).

## 8. Decisiones del usuario

| # | Pregunta | Estado |
|---|---|---|
| D1 | ¿Se admite entrar con una cuenta de contraseña compartida? | **Decidido (05-nov-2026):** sí, como cuenta de cargo (§4.9) |
| D2 | ¿Quién decide el área que autoriza en HelpDesk? | **Decidido (05-nov-2026):** Conecta, y la lista mientras tanto. HelpDesk solo es dueño de la traducción (§4.10) |
| D3 | Ante una baja o una cuenta deshabilitada, ¿qué se hace? | **Decidido (05-nov-2026):** bloquear sin quitar el rol y avisar (§4.4) |
| D4 | Donde un cambio en la lista llevó tickets a un marcador, ¿se reconstruye la atribución con los intervalos de §7.4 o se acepta el marcador? | **Decidido (05-nov-2026):** reconstruir los 7 tickets de `mercadeo.mde@` (§4.3) |
| D5 | ¿Graph por personas con rol o por `delta` del tenant? | **Decidido (05-nov-2026):** por personas con rol (§4.6) |

## 9. Datos a medir antes de construir

Las consultas las corre el usuario contra la base de la VPS.

| # | Qué | Consulta o acción |
|---|---|---|
| C1 | Cuántas personas tienen rol, cuántas con `oid` y cuántas sin correo válido | `SELECT count(*) FILTER (WHERE rol_aplicacion IS NOT NULL), count(*) FILTER (WHERE rol_aplicacion IS NOT NULL AND entra_object_id IS NOT NULL), count(*) FILTER (WHERE rol_aplicacion IS NOT NULL AND correo_corporativo !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') FROM core.dim_personal;` |
| C2 | Total real de tickets | `SELECT origen_sistema, count(*) FROM helpdesk.fact_ticket GROUP BY 1;` |
| C3 | Estado de los ítems 311 y 405 y tickets de `mercadeo.mde@` desde el 13-oct, con su atribución actual | `SELECT sp_personal_id, nombre_completo, correo_corporativo, estado_activo, rol_aplicacion, entra_object_id IS NOT NULL AS enlazada FROM core.dim_personal WHERE sp_personal_id IN (311, 405);` y, para los tickets, el `id_asignado`/`id_solicitante` de los legacy cuyo `AsignadoA`, `Recibe` o `Title` en staging sea `mercadeo.mde@rbcol.co` |
| C4 | Qué objetos de Entra tienen `mercadeo.mde@` | Graph Explorer, con la cuenta propia: `GET /users?$filter=mail eq 'mercadeo.mde@rbcol.co' or userPrincipalName eq 'mercadeo.mde@rbcol.co'&$select=id,displayName,userPrincipalName,userType` y lo mismo en `/groups` y `/contacts` |

## 10. Verificación contra código

| # | Afirmación | Dónde | Estado |
|---|---|---|---|
| P1 | Ninguna clave foránea usa `sp_personal_id` | `schema.prisma` | Verificado por inspección |
| P2 | La 06 reescribe la atribución legacy en cada ejecución | Transform 06 | Verificado por inspección; sin ejercitar |
| P3 | Asignar y seguir exigen rol | `ticket-queries.ts`, `ticket-commands.ts` | Verificado por inspección |
| P4 | Conecta no guarda el `oid` de Entra | RBGCT-REACT 62e8518 | Verificado por inspección (`auth_id` sin escritor) |
| P5 | Un cambio en la lista reescribe la atribución pasada | Base viva, C3 | **Verificado con datos** (05-nov-2026): 7 tickets de `mercadeo.mde@` pasaron al marcador creado el 29-oct |
| P6 | La 06 resuelve con la tabla; ninguna query de la ingesta la borra; solo se cierra `hasta`; la 04 respeta la ocupación; un mismo patrón de correo en la 03, la 06 y la tabla | `legacy-attribution.contract.test.mts` | **Verificado por prueba** (6 pruebas, U36). Sin ejercitar contra la base |
| P7 | La tabla rechaza borrar, editar un intervalo cerrado y solapar | Trigger de `20261105100000_ocupacion_correo_personal` | Construido; sin ejercitar (no hay base local) |
| P8 | La primera ejecución solo reatribuye los tickets de `mercadeo.mde@` | Salida de la 06 en n8n | **Pendiente**: tras desplegar y reimportar |
| P9 | Resto de §4 (admisión, Graph, Conecta, cuentas de cargo, áreas) | — | Sin construir |

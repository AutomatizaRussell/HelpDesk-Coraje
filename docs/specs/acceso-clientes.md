# Acceso de clientes al portal

```
ESTADO:      aprobado y CONSTRUIDO, SIN DESPLEGAR (U8, corte 19). Las tres decisiones
             que lo bloqueaban se tomaron el 28-sep-2026: D2 (§3.1), D3 (§7) y D4
             (§11)
CORTE:       28-sep-2026
EVIDENCIA:   estática y unitaria: `tsc`, `lint`, `pnpm test` 120/120 (incluye
             `portal-policy.test.mts`, `client-access.contract.test.mts` y el
             perímetro de tres clases), `next build`, y el SQL de las dos migraciones
             parseado con el parser de PostgreSQL (`@libpg-query/parser`, cuerpos
             PL/pgSQL incluidos). **Sin ejercitar**: ninguna migración aplicada, ningún
             correo enviado, ninguna vista abierta
MIGRACIÓN:   `20260928100000_valores_acceso_clientes` (solo ADD VALUE) y
             `20260928110000_acceso_clientes`: siete tablas en `app`. Ninguna sustituye
             a `dim_cliente_contai`
```

**Autoridad:** este documento es propietario del contrato de acceso externo. La
identidad interna vive en `specs/acceso-empleados.md`; el ciclo del ticket, en
`specs/tickets.md`. Este documento no los duplica.

## 1. Punto de partida y por qué no se conserva

`/portal` listaba los clientes activos, dejaba elegir uno y guardaba la elección en una
cookie. No había contraseña, ni código, ni verificación de ninguna clase: quien
alcanzara la URL podía radicar tickets a nombre de cualquier empresa y leer los suyos.

Nunca lo usó un cliente real, así que **no hubo nada que migrar ni compatibilidad que
preservar**. Se retiró completo el 22-sep-2026 (U4), incluida la cookie de cliente
seleccionado, que era el mecanismo mismo del problema.

Lo que sigue de este documento describe **lo que hay que construir**, no lo que se
sustituye: no queda nada en pie de lo anterior.

> **Confirmación del usuario al cerrar U4 (23-sep-2026), y vale como criterio para lo
> que viene:** lo retirado no era una implementación de tickets externos a la que le
> faltara identidad. Era una lista de clientes donde cualquiera entraba a la vista de
> cualquier otro, sin nada resuelto del lado del ticket. **No se perdió lógica de
> negocio al borrarlo** — es el único caso del proyecto donde retirar no dejó deuda de
> conocimiento, a diferencia de la redirección interna, cuya lógica sí se conservó sin
> pantalla por ese motivo. La consecuencia práctica: al construir este contrato no hay
> comportamiento anterior que replicar ni con el que ser compatible, ni siquiera como
> referencia de qué esperaban los usuarios.

## 2. Decisión central

Se adopta el modelo de acceso externo de Impulsa: **autorización individual, invitación
de un solo uso, primera activación sin código, OTP para cada navegador adicional y
dispositivo recordado revocable.** Es un contrato ya escrito, ya implementado y ya
corregido cinco veces en el proyecto hermano; rehacerlo aquí desde cero sería repetir
sus cinco errores.

Lo que **no** se adopta tal cual es el **alcance** de la autorización, porque el dominio
es distinto y esa diferencia es estructural (§3).

## 3. La diferencia de dominio que hay que resolver antes de construir

| | Impulsa | HelpDesk |
|---|---|---|
| Objeto del acceso | Una **solicitud** concreta que la firma creó y envió | La **relación con el cliente**, continua |
| Quién inicia | La firma, al despachar una solicitud | El cliente, cuando tiene un problema |
| Cuándo termina | Con la solicitud | No termina mientras el cliente sea cliente |
| Invitación natural | El correo de la solicitud la lleva | **No existe un disparador equivalente** |

En Impulsa la autorización cuelga de un recurso que ya existe. En HelpDesk el cliente
llega **antes** de que exista ningún recurso: viene a crear el primero. Eso obliga a dos
diferencias que no se pueden calcar:

1. **La autorización se ancla al cliente, no al ticket.** Un contacto autorizado de una
   empresa puede radicar tickets nuevos indefinidamente sin una invitación por cada uno.
2. **El alta la hace la firma, como acto propio.** Alguien interno da de alta al contacto
   de una empresa y le envía su invitación. No hay correo de solicitud que la lleve, así
   que hace falta una acción interna que hoy no existe en ninguna vista.

### 3.1 `ABIERTO` Qué ve un contacto: la decisión que falta

Tres alcances posibles, y hay que elegir uno **antes** de diseñar las tablas, porque
cambia la clave de la autorización:

| Alcance | Ve | A favor | En contra |
|---|---|---|---|
| **Por contacto** | Solo los tickets que él radicó | Aislamiento máximo | Si la persona se va, sus tickets quedan sin dueño visible del lado del cliente |
| **Por empresa** *(recomendado)* | Todos los tickets de su empresa | Continuidad; un compañero retoma un caso abierto | Un contacto ve asuntos de otras áreas de su empresa |
| **Por empresa con reserva** | Los de su empresa, salvo los marcados reservados | Cubre el caso sensible | Exige decidir quién marca y con qué criterio, y equivocarse expone |

La recomendación es **por empresa**, porque una mesa de ayuda existe para que un asunto
no dependa de que una persona concreta esté disponible, y porque el tercer alcance
introduce una clasificación que alguien tiene que mantener correcta indefinidamente.

> **`DECISIÓN` (D2, 28-sep-2026): por contacto.** Un contacto ve **solo los tickets que
> él radicó**. Se aparta de la recomendación de arriba por decisión del usuario, y
> acepta su costo: si la persona deja la empresa cliente, sus tickets abiertos no los
> ve nadie más del lado del cliente (el equipo interno los sigue atendiendo igual).
>
> Consecuencias en el modelo: la autorización cuelga del contacto, y el contacto
> pertenece a un único cliente. `helpdesk.fact_ticket.id_contacto_portal` dice quién
> radicó, y la consulta del portal filtra por contacto **y** cliente del acceso
> (`src/server/portal/portal-tickets.ts`). Un correo activo identifica a lo sumo a un
> contacto (`ux_portal_contacto_correo_activo`): una misma dirección no puede ser
> contacto de dos clientes a la vez. Limitación aceptada para la v1.

## 4. Principios e invariantes

1. La identidad verificada **no concede recursos automáticamente**. El alcance se
   autoriza aparte y se revalida en servidor.
2. Todos los correos activos de un contacto tienen igual importancia. **No existe correo
   principal.**
3. Un error recuperable o una reverificación **nunca** borra lo que la persona escribió
   ni el progreso confirmado.
4. **Ningún token, código ni credencial se almacena en texto plano.** Alta entropía,
   comparación por hash.
5. El navegador **nunca** recibe credenciales permanentes de ningún sistema externo.
   **n8n no actúa como proveedor de identidad.**
6. Sin huella digital invasiva. «Dispositivo recordado» es un navegador o perfil con una
   credencial segura, rotatoria y revocable.
7. La delegación, si se habilita, es de **un solo nivel**: un delegado no puede delegar.

## 5. Modelo conceptual

Nombres conceptuales; los definitivos se deciden contra el esquema vigente y contra la
decisión de §3.1.

| Concepto | Responsabilidad |
|---|---|
| `ParticipanteExterno` | Identidad externa: una persona de un cliente, con sus correos |
| `AutorizacionPortal` | Concesión de acceso, con el alcance que fije §3.1 |
| `InvitacionPortal` | Credencial de activación inicial, individual y de un solo uso |
| `DesafioOtp` | Código temporal de seis dígitos para navegador adicional o recuperación |
| `DispositivoRecordado` | Credencial persistente y revocable de un navegador |
| `AuditoriaAccesoPortal` | Actor, autorización, recurso, acción, resultado |

## 6. Activación, dispositivos y OTP

1. La firma da de alta al contacto y envía una invitación individual por destinatario.
2. La invitación no activada vale hasta el vencimiento máximo de acceso.
3. La **primera apertura válida activa sin OTP** y consume la invitación de forma
   atómica.
4. El navegador queda recordado mediante credencial segura persistente.
5. El servidor redirige a una **URL operativa limpia**, sin secretos, apta para
   favoritos.
6. Una invitación consumida **no autentica otro navegador**, aunque se copie o reenvíe.

Otro navegador, modo incógnito, perfil distinto o borrar cookies = **dispositivo
nuevo** → OTP al correo vinculado → credencial propia de ese dispositivo. Varios
dispositivos por participante, cada uno revocable por separado.

**Valores iniciales, tomados de Impulsa por estar ya ejercitados:** seis dígitos ·
expiración 10 minutos · 10 intentos por desafío · hasta 6 emisiones por hora · un código
nuevo invalida el anterior · sin bloqueo irreversible automático · espera breve y
progresiva solo ante repetición anormal · se persiste el hash y metadatos mínimos, nunca
el código.

> **`DECISIÓN DE DISEÑO` (U8): el código se pide con el correo, no desde el enlace.** En
> Impulsa el navegador adicional entra desde el enlace de la solicitud, porque el acceso
> cuelga de ella. Aquí el acceso es continuo y el cliente vuelve cuando tiene un
> problema nuevo, sin enlace a mano: entra en `/portal/ingreso` escribiendo su correo.
> Eso abre la pregunta «¿este correo tiene acceso?», y **no se responde**: la pantalla
> y el tiempo de respuesta son los mismos exista o no el correo, esté revocado o se
> haya alcanzado el límite. El código se envía con `after()`, después de responder,
> para que n8n no delate con su demora qué correos existen. Solo pide código un acceso
> **ya activado**; uno sin activar entra por su invitación.
>
> **`INVARIANTE`** El dispositivo recordado **no basta por sí solo**. La autorización
> debe estar activada explícitamente —por consumo de invitación o por OTP verificado— y
> el guard exige ambas cosas. Impulsa cerró esta brecha el 03-sep-2026: un dispositivo
> recordado alcanzaba una autorización que nunca había activado, sin invitación, sin OTP
> y sin auditoría propia. **Se construye ya cerrada, no se hereda abierta.**
>
> **Construida (U8) de dos formas a la vez:** el dispositivo cuelga de la
> **autorización**, no del contacto (`app.portal_dispositivo.id_autorizacion`), así que
> no hay otra autorización a la que pueda llegar; y el guard exige además
> `activada_at` (`evaluatePortalAccess`, con prueba).

## 7. Vigencias

La vigencia de identidad y la capacidad de escribir son controles **distintos**. No hay
límite visible de sesión por horas.

| Concepto | Efecto |
|---|---|
| Vencimiento de acceso | Sin él, no hay acceso externo en ninguna modalidad |
| Solo lectura | Consulta e historial; bloquea mutaciones **en servidor**, no solo en la interfaz |
| Revocación | Bloquea aunque las fechas no hayan vencido |

> **`DECISIÓN` (D3, 28-sep-2026): solo revocación, y el navegador caduca por
> inactividad.** El acceso **no vence**: termina solo cuando alguien lo revoca (§8). Un
> navegador recordado que pasa **180 días sin uso** vuelve a pedir código. Valor
> elegido por el usuario, no medido.
>
> Por qué basta: quien deja la empresa cliente pierde su correo corporativo, y con él
> la posibilidad de recibir el código. El acceso se le cierra solo aunque nadie se
> acuerde de revocarlo.
>
> Cómo se construyó: la regla la aplica el servidor en cada lectura
> (`portal-policy.ts`, `evaluatePortalAccess`), no la fecha de la cookie. La cookie dura
> lo máximo que admiten los navegadores (400 días), porque en un render no se puede
> reescribir y una cookie de 180 días echaría también a quien entra cada semana.
>
> **Vida de la invitación sin usar: 14 días**. «Hasta el vencimiento máximo de acceso»
> (§6, paso 2) dejó de tener sentido sin vencimiento. Valor inicial, no medido; si
> caduca, quien administra accesos emite otra.

## 8. Revocación

| Evento | Efecto | Se conserva |
|---|---|---|
| Contacto desactivado | Revoca sus autorizaciones y dispositivos | Historial, tickets, auditoría |
| Correo desactivado | Revoca lo vinculado a ese correo | Los otros correos del contacto |
| Cliente desactivado | Revoca el acceso externo de toda la empresa | Todo el historial operativo |
| Revocación administrativa | Bloquea el alcance elegido | Auditoría completa |

**Revocar acceso no cancela trabajo.** Los tickets abiertos siguen su curso: el equipo
interno los atiende y los cierra. Lo que se pierde es la capacidad de radicar y
consultar desde fuera.

## 9. Auditoría y controles

**Eventos mínimos:** autorización creada, actualizada, vencida o revocada · invitación
emitida, reenviada, activada, consumida, vencida o revocada · OTP emitido, reenviado,
validado o fallido, **sin guardar el código** · dispositivo recordado, rotado o revocado
· acceso concedido o denegado con causa saneada.

**Controles:** cookies `Secure`, `HttpOnly` y `SameSite` apropiado · protección CSRF en
mutaciones basadas en cookie · rotación transparente y revocación en servidor ·
idempotencia en invitaciones y reenvíos · **mensajes externos que no revelen** correos,
contactos ni tickets ajenos · limitación de tasa tolerante y recuperable.

> **Un mensaje de error honesto de más es una enumeración.** Del lado interno conviene
> decir qué puerta falló (`acceso-empleados.md` §7); del lado externo, no: «el acceso no
> es válido» para todas las causas, y el detalle solo en el registro del servidor.

## 10. Criterios de aceptación

- Un contacto **no** alcanza datos de un cliente que no sea el suyo, ni invocando la API
  directamente.
- Consumir una invitación **no** afecta a ninguna otra.
- Una invitación consumida **no** autentica un segundo navegador.
- Un dispositivo recordado **no** entra a una autorización que no activó.
- Borrar cookies o usar incógnito lleva a OTP, **no a pérdida de lo escrito**.
- Solo lectura bloquea la escritura **en servidor**, con prueba negativa.
- Desactivar contacto, correo o cliente aplica **exactamente** el alcance de §8.
- Ningún mensaje externo revela la existencia de un contacto, un correo o un ticket
  ajeno.

## 11. Orden de implementación

| # | Entrega | Depende de | Estado (corte 19) |
|---|---|---|---|
| 1 | **Decidir §3.1 y §7** | Usuario | **Hecho** (D2, D3, D4 el 28-sep-2026) |
| 2 | Modelo de datos del acceso externo | 1 | Construido, sin aplicar |
| 3 | Alta interna de contactos y emisión de invitaciones | 2, `specs/permisos.md` | Construido (`/accesos`, rol `ADMIN`) |
| 4 | Activación, dispositivo recordado y OTP | 2 | Construido (`/portal/activar`, `/portal/ingreso`) |
| ~~5~~ | ~~Retirar `/portal` actual y su cookie de cliente~~ | | **Hecho el 22-sep-2026, fuera de orden** |
| 6 | Consola interna de accesos: consultar, reenviar, revocar | 4 | Construido, más solo lectura |
| 7 | Radicar (T1) y clasificar (T3) tickets del portal | 2, `specs/tickets.md` | Construido (`/portal/tickets`, `/clasificacion`, rol `CLASIFICADOR`) |

**Roles (decisión del usuario, 28-sep-2026).** `CLASIFICADOR` redirige los tickets del
portal (`ticket.redirigir`, `TOTAL`); `ADMIN` administra los accesos
(`portal.acceso.administrar`). Separados a propósito: quien reparte el trabajo no
concede acceso externo. No se llama `RECEPCION` para no confundirlo con la recepción
física de la firma. Los dos parten de una **copia** de las reglas de `AGENTE`.

**Fuera de la v1, registrado:** varios correos por contacto desde la consola (el
modelo los admite, pero la vista da de alta uno); desactivar un contacto (hoy se
revoca su acceso); aviso por correo al cliente cuando radica («recibimos tu
solicitud»), que necesitaría el buzón de la firma y no un empleado; delegación (§4,
invariante 7), que no se pidió.

> **El paso 5 se adelantó a los cuatro anteriores, y la razón importa.** Estaba escrito
> como último porque se suponía que el portal abierto se apagaría al encender el
> cerrado. Lo que cambió no fue el diseño sino la exposición: desde que `/helpdesk/*`
> sirve tráfico en el dominio público, `/portal` dejó de ser un prototipo que nadie
> alcanzaba. Esperar a los pasos 1-4 —bloqueados por decisiones de negocio sin fecha—
> significaba mantener abierta mientras tanto la lista de clientes activos con su
> identificación fiscal. Se retiró en U4 sin sustituto: **hoy no hay ningún acceso
> externo**, y construirlo sigue siendo este documento.

> **`DECISIÓN` (D4, 28-sep-2026): n8n, desde el buzón sin dueño
> `automatizacionmedellin@rbcol.co`, por Microsoft Graph.** El correo del portal no
> tiene remitente humano (el código lo pide el cliente a cualquier hora), así que sale
> del buzón de la firma, como en Impulsa. Workflow versionado:
> `n8n/HELPDESK - Portal - Enviar correo V3.json`.
>
> - **Graph y no SMTP.** El flujo de prueba del usuario («Correo empresarial») envía por
>   SMTP con usuario y contraseña, que es la autenticación que Microsoft anunció que
>   retira de Exchange Online. El workflow usa una credencial *Microsoft OAuth2* de n8n
>   con la App Registration compartida con Conecta, autorizada **iniciando sesión como
>   el buzón**, con permisos **delegados** (`Mail.Send`). No se añade ningún permiso de
>   aplicación: con el secreto compartido, un `Mail.Send` de aplicación sin restringir
>   permitiría enviar como cualquier buzón del tenant.
> - **Sin cola y sin reintento, a propósito.** Estos correos llevan un secreto (enlace
>   de un solo uso o código), y una cola exigiría guardarlo (invariante 4). La
>   aplicación entrega el correo a n8n en el momento y audita el resultado; un envío
>   fallido se repite emitiendo un secreto nuevo.
> - **n8n no guarda el cuerpo.** El workflow fija `saveDataSuccessExecution` y
>   `saveDataErrorExecution` en `none` (observación B8 de Impulsa), y Graph recibe
>   `saveToSentItems: false`, para que el buzón no acumule códigos en «Elementos
>   enviados».
> - **Riesgo aceptado:** la credencial delegada del buzón caduca si le cambian la
>   contraseña, le revocan las sesiones o pasa unos 90 días sin enviar nada. Hay que
>   volver a autorizarla en n8n; mientras tanto, los códigos no llegan y el fallo queda
>   en la alerta de Teams y en `app.portal_auditoria`.
>
> Los correos que produce un **empleado** sobre un ticket del portal (respuesta,
> rechazo) siguen D6: salen de la cuenta de quien actúa, hacia cada correo activo del
> contacto, con enlace al portal.

---

## 12. Verificación contra código

Verificado contra el código del corte 19 (sin desplegar). «Por prueba» es estático o
unitario; nada de esta tabla está ejercitado contra la base.

| # | Afirmación a verificar | Dónde comprobarlo | Estado |
|---|---|---|---|
| V1 | El selector abierto de `/portal` y su cookie no existen | `grep` sobre `src/` | **Cumplida el 22-sep-2026 (U4).** El `/portal` nuevo no es público: exige el navegador recordado (V8) |
| V2 | Los tokens e invitaciones se comparan por hash y nunca se guardan en claro | `portal-invitations.ts`, `portal-otp.ts`, migración | **Por prueba**: columnas `*_hash CHAR(64)` y ninguna en claro (`client-access.contract.test.mts`). El código es un HMAC con subclave derivada (`deriveSubkey`), no un SHA-256 plano |
| V3 | El guard exige activación **además** de dispositivo válido | `portal-policy.ts`, `portal-access.ts` | **Por prueba** (`portal-policy.test.mts`), y el dispositivo cuelga de la autorización |
| V4 | La escritura externa pasa por un guard de escritura propio, con prueba negativa | `requirePortalWriteAccess` en `features/portal/actions.ts` | Construida; **prueba negativa pendiente contra la base** (acceso en solo lectura que intenta radicar) |
| V5 | La revocación aplica el alcance de §8, sin excederlo | `revokeAccess` | Construida: autorización, invitación pendiente, códigos vivos y navegadores de **esa** autorización; los tickets siguen. Sin ejercitar |
| V6 | Los mensajes externos no distinguen causas | `/portal/ingreso`, `entry-actions.ts`, `portal-otp.ts` | Construida: mismo texto y mismo tiempo exista o no el correo. Sin ejercitar |
| V7 | Los valores de OTP coinciden con §6 | `portal-policy.ts` | **Cumplida**: 6 dígitos, 10 min, 10 intentos, 6 por hora, uno nuevo invalida el anterior |
| V8 | Las rutas del portal figuran en el perímetro | `public-paths.ts`, `proxy.ts` | **Por prueba**: tres clases de ruta (`PUBLICA`, `PORTAL`, `EMPLEADO`); solo `/portal/ingreso` y `/portal/activar` son públicas, y una credencial no abre la clase de la otra (`perimeter.test.mts`, `proxy.test.mts`) |

**Changelog:** 03-sep-2026 — línea base. Adopta el mecanismo de acceso externo de
Impulsa y aísla la diferencia de dominio que impide calcarlo: la autorización se ancla
al cliente y no al ticket, y el alta la hace la firma (§3). Deja abiertas la frontera de
visibilidad (§3.1), la existencia de vencimiento (§7) y el remitente del correo (§11).
Incorpora ya cerrada la brecha de dispositivo/activación que Impulsa corrigió el mismo
día (§6).
- 23-sep-2026 (U4) — **el portal abierto se retira sin sustituto.** El paso 5 de §11 se
  adelanta a los cuatro que lo precedían porque el riesgo dejó de ser teórico al
  empezar a servirse `/helpdesk/*` en el dominio público. Consecuencia que este
  documento debe registrar con todas sus letras: **HelpDesk no tiene hoy ningún canal
  externo de recepción de tickets**, y las tres decisiones abiertas (D2 visibilidad,
  D3 vencimiento, D4 remitente del correo) son lo único que separa a los clientes de
  volver a tener uno.
- 28-sep-2026 (U8, corte 19) — **decididas D2, D3 y D4, y construido el contrato sin
  desplegar.** D2: cada contacto ve solo lo suyo. D3: sin vencimiento, 180 días de
  inactividad por navegador, 14 días de vida para una invitación. D4: n8n por Graph
  delegado desde `automatizacionmedellin@`, sin cola porque el correo lleva el secreto.
  Diferencia de diseño con Impulsa: el código se pide con el correo. Roles
  `CLASIFICADOR` y `ADMIN`. Tabla de verificación resuelta contra el código.

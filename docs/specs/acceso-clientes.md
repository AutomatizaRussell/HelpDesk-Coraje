# Acceso de clientes al portal

```
ESTADO:      aprobado en su forma, ABIERTO en su alcance — el mecanismo se adopta de
             `plataforma-impulsa`; la frontera de qué ve un contacto es decisión de
             negocio sin tomar (§3.1). NO implementado
CORTE:       03-sep-2026
EVIDENCIA:   ninguna. Lo que existe hoy en `/portal` es un selector abierto: cualquiera
             que alcance la URL elige cualquier cliente y opera a su nombre
MIGRACIÓN:   requiere seis tablas nuevas. Ninguna sustituye a `dim_cliente_contai`
```

**Autoridad:** este documento es propietario del contrato de acceso externo. La
identidad interna vive en `specs/acceso-empleados.md`; el ciclo del ticket, en
`specs/tickets.md`. Este documento no los duplica.

## 1. Punto de partida y por qué no se conserva

`/portal` lista los clientes activos, deja elegir uno y guarda la elección en una
cookie. No hay contraseña, ni código, ni verificación de ninguna clase. Quien alcance la
URL puede radicar tickets a nombre de cualquier empresa y leer los suyos.

Nunca lo usó un cliente real, así que **no hay nada que migrar ni compatibilidad que
preservar**. Se retira completo, incluida la cookie de cliente seleccionado, que es el
mecanismo mismo del problema.

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

> **`DECISIÓN` pendiente del usuario.** No se elige aquí. Mientras no se elija, la
> especificación de las tablas queda bloqueada: el alcance es literalmente la clave de
> la fila de autorización.

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

> **`INVARIANTE`** El dispositivo recordado **no basta por sí solo**. La autorización
> debe estar activada explícitamente —por consumo de invitación o por OTP verificado— y
> el guard exige ambas cosas. Impulsa cerró esta brecha el 03-sep-2026: un dispositivo
> recordado alcanzaba una autorización que nunca había activado, sin invitación, sin OTP
> y sin auditoría propia. **Se construye ya cerrada, no se hereda abierta.**

## 7. Vigencias

La vigencia de identidad y la capacidad de escribir son controles **distintos**. No hay
límite visible de sesión por horas.

| Concepto | Efecto |
|---|---|
| Vencimiento de acceso | Sin él, no hay acceso externo en ninguna modalidad |
| Solo lectura | Consulta e historial; bloquea mutaciones **en servidor**, no solo en la interfaz |
| Revocación | Bloquea aunque las fechas no hayan vencido |

> `ABIERTO` Los plazos concretos dependen de §3.1. En Impulsa una autorización muere con
> su solicitud; aquí, ligada a la relación comercial, un vencimiento anual obligaría a
> reinvitar a todos los contactos de todos los clientes cada año. **Hay que decidir si
> el vencimiento existe o si la revocación explícita es el único final.**

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

| # | Entrega | Depende de |
|---|---|---|
| 1 | **Decidir §3.1 y §7** | Usuario |
| 2 | Modelo de datos del acceso externo | 1 |
| 3 | Alta interna de contactos y emisión de invitaciones | 2, `specs/permisos.md` |
| 4 | Activación, dispositivo recordado y OTP | 2 |
| 5 | Retirar `/portal` actual y su cookie de cliente | 4 |
| 6 | Consola interna de accesos: consultar, reenviar, revocar | 4 |

> `ABIERTO` **Por dónde sale el correo.** Impulsa lo envía desde la aplicación con
> Microsoft Graph y el *grant* delegado de quien pulsa el botón, y retiró n8n de esa
> ruta. Aquí no hay *grant* porque `acceso-empleados.md` §9 lo deja fuera de alcance, y
> el correo del portal **no tiene un remitente humano natural**: lo emite la firma. Las
> dos salidas conocidas son un buzón de firma con su propio *grant*, como hace Impulsa
> para las invitaciones delegadas, o un workflow de n8n. **Sin decidir**, y bloquea el
> paso 3.

---

## 12. Verificación contra código

Sin implementación; la tabla queda escrita para la unidad que la construya.

| # | Afirmación a verificar | Dónde comprobarlo |
|---|---|---|
| V1 | El selector abierto de `/portal` y su cookie no existen | `grep` sobre `src/` |
| V2 | Los tokens e invitaciones se comparan por hash y nunca se guardan en claro | Servicios de invitación y OTP |
| V3 | El guard exige activación **además** de dispositivo válido | Guard de acceso del portal |
| V4 | La escritura externa pasa por un guard de escritura propio, con prueba negativa | Handlers de mutación del portal |
| V5 | La revocación aplica el alcance de §8, sin excederlo | Servicios de desactivación |
| V6 | Los mensajes externos no distinguen causas | Cadenas de error de las rutas públicas |
| V7 | Los valores de OTP coinciden con §6 | Constantes del servicio |
| V8 | Las rutas del portal figuran en la lista pública del perímetro | Proxy |

**Changelog:** 03-sep-2026 — línea base. Adopta el mecanismo de acceso externo de
Impulsa y aísla la diferencia de dominio que impide calcarlo: la autorización se ancla
al cliente y no al ticket, y el alta la hace la firma (§3). Deja abiertas la frontera de
visibilidad (§3.1), la existencia de vencimiento (§7) y el remitente del correo (§11).
Incorpora ya cerrada la brecha de dispositivo/activación que Impulsa corrigió el mismo
día (§6).

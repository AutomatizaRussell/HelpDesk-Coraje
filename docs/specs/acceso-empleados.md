# Acceso de empleados

```
ESTADO:      CONSTRUIDO Y EJERCITADO contra el despliegue. El contrato está completo
             en sus once entregas: U3 (22-sep-2026) cerró el flujo OIDC, la admisión
             y la sesión; U4 (22-sep-2026) cerró el perímetro *deny-by-default* y
             **retiró `REDIRECCION_PASSWORD`**, que ya no existe ni en el código ni
             en las variables del servicio. D6 (§9) resuelta el 17-sep-2026: el
             consentimiento de `Mail.Send`/`offline_access` ya se pide, el mecanismo
             de envío sigue sin construir
CORTE:       23-sep-2026
EVIDENCIA:   `prisma generate`/`tsc --noEmit`/`eslint`/`next build` limpios y 42
             pruebas unitarias (`pnpm test`). **Más comportamiento observado contra
             `https://conecta.rbgct.cloud/helpdesk`:** seis escenarios de ingreso y
             rechazo en U3, y cuatro del perímetro en U4 — ver §12 para el detalle
             por afirmación, incluidas las dos que siguen sin poderse ejercitar
MIGRACIÓN:   aplicada — `prisma/migrations/20260911150000_agregar_identidad_empleados`
             (columnas nuevas en `core.dim_personal`, schema `app` con
             `employee_session`), corrida por el servicio `migrate` en el deploy real
```

**Autoridad:** este documento es propietario del contrato de identidad interna y de la
relación con Conecta. Las reglas de rol estables viven en `contexto-canonico.md`; el
gobierno de permisos, en `specs/permisos.md`; la identidad externa, en
`specs/acceso-clientes.md`. Este documento no los duplica.

## 1. Decisión central

**Cada módulo de la plataforma resuelve su propia identidad contra el tenant corporativo
de Entra ID y emite su propia sesión. Ningún token viaja entre aplicaciones.**

Conecta aporta **navegación**, no identidad: el enlace de entrada al módulo y el enlace
*Volver a Conecta* dentro de él. Nada más.

## 2. Veredicto sobre el traspaso de token desde Conecta

La idea de que Conecta entregue a HelpDesk el token que obtuvo al iniciar sesión —
«cifrado lo suficiente» — se evaluó y **se descarta**. Tres razones, en orden de peso:

1. **El token de Conecta no sirve aquí, aunque llegue intacto.** Un `id_token` de OIDC
   lleva una audiencia (`aud`) que nombra a la aplicación que lo pidió. Aceptar uno
   emitido para Conecta significa desactivar la validación de audiencia, que es
   justamente el control que impide que un token de otra aplicación del mismo tenant
   sirva como entrada aquí. El código de Impulsa lo dice en el comentario de
   `validateIdToken`: *«A token minted for a different app in the same tenant is not a
   login here.»*
2. **La revocación deja de funcionar.** Con sesión propia, cerrar el acceso de una
   persona es una escritura en una fila. Con token heredado, HelpDesk depende de que
   Conecta se entere, decida propagarlo y acierte con el mecanismo. La revocación pasa a
   ser un acuerdo entre dos equipos en lugar de una operación.
3. **Crea una dependencia de disponibilidad y de calendario.** Conecta la mantiene otra
   persona. Cada cambio en el formato del traspaso, cada rotación de la clave con que se
   cifra, cada incidente suyo, se convierte en un incidente de HelpDesk. Y para
   construirlo hay que coordinar dos despliegues antes de poder probar el primero.

> **Lo que el planteamiento buscaba de verdad era no ver el botón de Microsoft cada vez.
> Eso se consigue sin traspasar nada** — §4. El traspaso resolvía un problema que el
> SSO del propio tenant ya resuelve, a cambio de tres problemas nuevos.

**Alternativa también evaluada y descartada:** cookie de sesión compartida en el dominio
padre (`.dominio.co`). Funciona técnicamente si ambos módulos son subdominios, pero
exige que uno de los dos emita la sesión de los dos, comparta el secreto de firma y fije
el ciclo de vida para ambos. Es el mismo acoplamiento por otra vía, y añade que un fallo
en la emisión deja fuera a las dos aplicaciones a la vez.

**Evidencia de que el modelo desacoplado funciona.** Impulsa convivió con Conecta sin
compartir identidad con él. Un barrido sobre todo su código —`*.ts`, `*.tsx`, compose y
`.env.example`— devuelve exactamente **una** relación: la variable
`NEXT_PUBLIC_CONECTA_URL`, consumida en `Sidebar.tsx` y `MobileNav.tsx` para pintar un
enlace de vuelta. No hay validación de tokens de Conecta, no hay cookie compartida, no
hay endpoint de traspaso. Durante todo ese tiempo, el empleado que venía de Conecta
entraba con su propia sesión de Impulsa y nadie lo vivió como una segunda autenticación.

> **Impulsa dejó de plantearse como módulo de Conecta** —creció hasta despegarse y su
> enlace de vuelta se retira—, así que **no es referencia de cómo integrarse**
> (`contexto-canonico.md` §1.1). Lo que su código sigue demostrando es lo otro: que
> convivir con Conecta **nunca exigió compartir credenciales**.

**HelpDesk sí va a ser —o parecer— parte de Conecta, y eso no cambia nada de esta
decisión.** Integrarse visualmente y compartir identidad son problemas distintos: lo
primero se resuelve con barra lateral, URL y shell comunes; lo segundo, con que ambos
módulos autentiquen contra el mismo tenant. Ninguna de las dos cosas necesita que un
token cruce de una aplicación a otra. La continuidad que el usuario percibe la produce
§4, no un traspaso.

## 3. Actores y fronteras

| Actor | Origen | Puede | No puede |
|---|---|---|---|
| Empleado admitido | Cuenta del tenant **con** registro activo en el directorio interno | Entrar y ejercer las acciones de su rol | Ejercer acciones fuera de su rol o de su alcance |
| Empleado del grupo no admitido | Cuenta del tenant **sin** registro interno | Autenticarse contra el tenant | Entrar. La autenticación se completa y el acceso se deniega con causa legible |
| Cliente | Portal externo | Ver y operar lo que su autorización concede | Alcanzar ninguna ruta interna |
| Máquina (n8n) | Secreto compartido | Llamar los endpoints que le corresponden | Tener sesión, rol ni identidad humana |

**El tenant corporativo es compartido por varias oficinas del grupo.** Superar la
autenticación prueba que la persona trabaja en el grupo, no que trabaja en la mesa de
ayuda. El registro en el directorio interno es la lista de admitidos y **no hay una
segunda puerta**.

## 4. Fricción: qué ve realmente el empleado

> **Actualizado el 24-sep-2026** (decisión del usuario): la entrada depende de si el
> navegador tiene sesión de Conecta, y quien entra directo **elige cuenta**. El mecanismo
> completo, sus reglas y sus riesgos están en `specs/integracion-conecta.md`; esta tabla
> resume lo que ve el empleado.

| Situación | Qué ocurre |
|---|---|
| Llega con sesión de Conecta y de Entra vivas | **Ningún clic.** `/ingreso` pasa la cuenta de Conecta como `login_hint` y el intento silencioso entra con ella, aunque el navegador tenga varias cuentas abiertas |
| Llega con sesión de Conecta, pero la de Entra expiró | Pantalla de Microsoft con la cuenta ya sugerida (modo `hinted`), una vez |
| Llega **sin** sesión de Conecta (enlace directo, marcador) | Pantalla de ingreso de HelpDesk; el botón abre el **selector de cuenta** de Microsoft (`prompt=select_account`), aunque haya sesión viva |
| Cuenta del tenant sin registro interno | Pantalla que nombra la causa y a quién pedir el alta |

> **Por qué la pista y no solo `prompt=none`.** Con varias cuentas abiertas en el
> navegador —la personal más buzones compartidos, habitual en la firma— Entra no puede
> elegir sin preguntar y responde `interaction_required` aunque todas tengan sesión. Se
> observó en producción el 24-sep-2026: cuatro cuentas abiertas, selector en cada
> ingreso. `login_hint` le dice a Entra cuál usar.

El mecanismo del primer caso es `prompt=none` en la petición de autorización: se le pide
al proveedor que **no interactúe**. Si hay sesión en el tenant, devuelve el código de
inmediato; si no la hay, devuelve `login_required` o `interaction_required`, y solo
entonces se repite la petición sin `prompt=none`, que es cuando aparece la pantalla de
Microsoft.

> **`INVARIANTE`** El intento silencioso se marca con una cookie de un solo uso antes de
> redirigir. Sin esa marca, un proveedor que responda `login_required` de forma
> persistente produce un bucle de redirección infinito, y el bucle es indistinguible de
> una caída para quien lo sufre.

> **Costo declarado.** «Ningún clic» es el caso ordinario, no una garantía absoluta.
> Nadie puede eliminar la pantalla de Microsoft del primer ingreso en un navegador
> nuevo sin compartir credenciales entre aplicaciones, que es exactamente lo que §2
> descarta.

## 5. Mecánica del ingreso

Flujo de código de autorización OIDC con PKCE, cliente confidencial, contra el tenant
corporativo. Cada paso es una puerta de la que depende el siguiente:

| # | Paso | Regla |
|---|---|---|
| 1 | Construir la petición | `state`, `nonce` y `code_verifier` aleatorios de alta entropía; el reto se envía como `S256` |
| 2 | Sellar el estado en cookie | Incluye el destino pretendido, **saneado a ruta del mismo sitio**. El destino nunca viaja en un parámetro que vuelva del proveedor |
| 3 | Intercambiar el código | Por el canal trasero. Los tokens no tocan el navegador y el secreto no sale del servidor |
| 4 | Validar el `id_token` **completo** | Firma con `RS256` fijado, emisor, **audiencia**, `nonce` y expiración con holgura de reloj. En ese orden y sin omitir ninguno |
| 5 | Construir la identidad | Verifica el `tid` del tenant. Separado del paso 4 a propósito, para que no se pueda saltar llamando directo |
| 6 | **Admitir** contra el directorio | La puerta que importa. Sin fila activa, no hay sesión |
| 7 | Emitir la sesión propia | Cookie opaca; en la base, su hash |

**PKCE se usa aunque el cliente sea confidencial.** Cuesta un hash y cierra la
interceptación del código con independencia de que el secreto se comprometa alguna vez:
las dos protecciones no son redundantes, fallan de maneras distintas.

**Fijar `alg: RS256` no es ceremonia.** Aceptar el algoritmo que declara el propio token
admite `none`, que es la falsificación clásica de JWT.

## 6. La sesión

El navegador guarda **una credencial opaca aleatoria y nada más**. PostgreSQL guarda su
hash, a quién pertenece, qué proveedor afirmó la identidad y cuándo muere. De ahí salen
tres propiedades que una cookie con el identificador del empleado no tiene:

- **Infalsificable.** Editar la cookie produce un valor sin fila que le corresponda.
- **Revocable.** Una fila se mata en servidor, ya, para una persona o para todas, sin
  esperar a que caduque nada en el navegador.
- **Atribuible.** La fila registra proveedor y sujeto, así que la auditoría distingue el
  origen de cada sesión.

| Propiedad | Valor | Razón |
|---|---|---|
| Vida absoluta | 8 horas, **sin renovación deslizante** | Una jornada. Una sesión que se renueva sola no vence nunca |
| Cookie | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` | `Lax` permite la vuelta del proveedor por navegación de primer nivel |
| Marca de actividad | Escritura limitada a una cada 5 minutos | Renderizar una página no debe costar una escritura |

> **`INVARIANTE`** Cada petición **relee el directorio** y **reevalúa las mismas reglas
> de admisión** que se aplicaron al entrar. Desactivar a una persona o quitarle el rol
> surte efecto en su siguiente navegación, no en su siguiente ingreso. Una sesión no
> puede sobrevivir a las condiciones que la justificaron.

## 7. Admisión: el directorio como lista de admitidos

Reglas de **denegación** con causa explícita. No hay rama que admita por defecto:

| Rechazo | Condición |
|---|---|
| `EMAIL_INVALID` | El correo recibido no es un correo |
| `NOT_REGISTERED` | No hay fila en el directorio para ese sujeto ni para ese correo |
| `INACTIVE` | La fila no afirma que la persona está activa |
| `UNKNOWN_ROLE` | La fila no tiene un rol que el autorizador sepa evaluar |

> **La ausencia de estado no admite.** Una fila sin estado es una fila que nadie ha
> avalado, y las creadas a mano son justo las menos revisadas. La regla es positiva: el
> directorio tiene que **afirmar** que la persona está activa.

**Búsqueda por sujeto inmutable, con el correo como arranque.** El identificador de
objeto del directorio corporativo no cambia; el correo sí. En el primer ingreso federado
se busca por correo y se **enlaza** el sujeto a la fila. Desde entonces se busca por
sujeto. El enlace se escribe solo si la fila no tiene ninguno: **jamás se sobrescribe
uno existente desde una petición**, porque es lo que impide que una cuenta renombrada o
recreada capture en silencio el historial de otra persona.

**Un rechazo dice cuál puerta falló.** El público es alguien que ya tiene cuenta en el
tenant, no internet abierto, y «no puede entrar» sin causa convierte cada alta en un
ticket de soporte.

### 7.1 `RIESGO` El directorio actual no puede sostener esto

`core.dim_personal` es hoy el candidato natural a directorio, y **le faltan tres cosas**:

| Falta | Consecuencia |
|---|---|
| `rol_aplicacion` | No hay nada que el autorizador pueda evaluar. Todo rechazo sería `UNKNOWN_ROLE` |
| `entra_object_id` | No hay a qué enlazar el sujeto inmutable; la identidad quedaría atada al correo |
| `correo_corporativo` es **nullable** | Una fila sin correo no puede ser buscada en el primer ingreso |

Además, `dim_personal` se **alimenta desde SharePoint** por el pipeline de ELT
(`sql/elt/03_transform_personal.sql`). Un directorio que otro proceso reescribe no puede
ser a la vez la lista de admitidos sin decidir antes qué columnas son de la fuente y
cuáles son de la plataforma, y qué pasa cuando la fuente deja de traer una fila.

> `ABIERTO` **Dato que falta y hay que medir antes de diseñar la migración:** cuántas
> filas de `core.dim_personal` tienen `correo_corporativo` no nulo y `estado_activo`
> verdadero. Si la cobertura es baja, el alta inicial no es una migración: es un trabajo
> manual de directorio que hay que planificar como tal.

## 8. Perímetro: denegar por defecto

Toda ruta es privada salvo que figure en una **lista pública explícita**. El modelo
contrario —cada página con su propio guard— es correcto solo mientras nadie olvide.

Rutas públicas previstas: la pantalla de acceso · las rutas de autenticación · el portal
de clientes y su API, que se protegen con **otra identidad**, no con ninguna · los
endpoints de máquina para n8n, con secreto comparado en tiempo constante · el health
check.

> **Lista pública real tras U4 (22-sep-2026): solo `/login` y `/api/auth/microsoft`.**
> De las otras tres previstas, ninguna llegó a existir como excepción. El portal de
> clientes **se retiró** en lugar de declararse público: la identidad que iba a
> protegerlo no está construida y no tiene fecha, así que declararlo habría dejado por
> escrito una superficie anónima en un dominio público. Los endpoints de máquina para
> n8n y el health check **no existen todavía**; cuando se construyan entrarán aquí uno
> a uno, que es el único acto que vuelve algo público
> (`src/server/security/public-paths.ts`).
>
> El perímetro deja pasar además los archivos estáticos de una **lista exacta**, no por
> extensión ni por carpeta: sin ella, el optimizador de imágenes de Next —que descarga
> el archivo original con una petición interna, sin cookies— recibiría una redirección
> y fallaría sin error visible.

**Dos capas, ninguna redundante.** El perímetro no alcanza PostgreSQL, así que comprueba
que la cookie **está presente**, no que sea válida: eso corta el tráfico anónimo antes
de que llegue a ninguna ruta privada. La lectura de sesión decide si esa cookie
corresponde a una sesión viva de una persona admisible. Retirar la primera vuelve
alcanzable una página sin guard; retirar la segunda hace que una cookie falsificada
funcione.

**Errores de ingreso por código cerrado.** La pantalla no imprime el parámetro de error
tal cual: interpreta códigos de un conjunto conocido y **no muestra nada** ante uno
desconocido. Un enlace fabricado no puede poner texto propio en una pantalla
corporativa.

## 9. Lo que este contrato **no** incluye (todavía)

- **Envío de correo como el empleado — D6 resuelta (17-sep-2026): sí hará falta.**
  Confirmado por el usuario: HelpDesk necesitará que la respuesta al cliente pueda
  salir como correo desde la cuenta de quien atendió el ticket. El **consentimiento**
  ya se pide desde U3 — `Mail.Send` y `offline_access` están en el `scope` de la
  petición de autorización (`src/server/auth/entra-oidc.ts`) desde el primer
  despliegue de identidad, precisamente para no exigir una segunda ronda de
  consentimiento por empleado el día que el envío se construya. **Lo que sigue sin
  construirse es el mecanismo mismo**: Impulsa lo resuelve con un *grant* delegado
  cifrado (`graph-grant.ts`) porque despacha correo horas después y sin sesión activa
  — HelpDesk necesitará el mismo patrón, adaptado, cuando se construya el envío real
  (probablemente junto al ciclo del ticket, `U7`). Hasta entonces, el intercambio de
  código recibe el `refresh_token` en la respuesta y lo descarta sin persistirlo — ver
  comentario en `exchangeAuthorizationCode`.
  - **Pendiente, no decidido:** si además hará falta `Mail.Send.Shared` para un
    escenario de correo desde un buzón compartido de la firma (el dominio ya tiene ese
    patrón — F10, `es_responsable_historico_no_identificado`), en vez de siempre desde
    la cuenta de una persona. No se pide ese scope hasta que se confirme.
- **Suplantación para pruebas.** Impulsa la tiene, marcada como temporal y a retirar
  antes de producción, y su propia spec la declara en contradicción con otra decisión
  suya. No se importa.
- **Selector de empleados.** Impulsa lo eliminó, no lo restringió: un *server action*
  exportado que convierte un correo de formulario en sesión lo invoca cualquiera que
  sepa su nombre, con independencia de lo que la pantalla dibuje. No se construye.

## 10. Criterios de aceptación

- Un token emitido para otra aplicación del tenant **no** produce sesión aquí.
- Una cuenta del tenant sin fila activa en el directorio **no** entra, y la pantalla
  nombra la causa.
- Desactivar a una persona en el directorio le cierra el paso **en su siguiente
  navegación**, sin esperar a que expire su cookie.
- Editar la cookie de sesión a mano no concede acceso.
- Una página nueva bajo una ruta privada queda protegida **sin que su autor haga nada**.
- El destino pretendido sobrevive al ingreso y **no puede convertirse** en una
  redirección a otro sitio.
- El caso ordinario —persona con sesión de Entra viva— entra **sin ver ninguna pantalla
  del proveedor**, y un fallo del intento silencioso **no produce bucle**.
- Existe **prueba negativa** por cada rechazo de admisión.

## 11. Orden de implementación

| # | Entrega | Depende de |
|---|---|---|
| 1 | Medir la cobertura del directorio (§7.1) | — |
| 2 | Decidir el modelo de esquema (`contexto-canonico.md` §4) | — |
| 3 | Columnas de directorio y tablas de sesión | 1, 2 |
| 4 | OIDC, validación, admisión y sesión | 3 |
| 5 | Perímetro *deny-by-default* | 4 |
| 6 | Retirar `REDIRECCION_PASSWORD` y su ruta de acceso | 5 |
| 7 | SSO silencioso con `prompt=none` | 5 |

> El paso 6 **no es opcional ni posterior**: mientras la clave compartida siga en el
> código, existen dos formas de entrar y la más débil no deja rastro de quién entró.

**Los siete pasos están construidos y ejercitados** (U3, 22-sep-2026; U4, 22-sep-2026).
El perímetro añadió una decisión que esta tabla no preveía: el portal de clientes **no
se declaró público, se retiró**. Estaba en un dominio público sirviendo la lista de
clientes activos con su identificación fiscal y aceptando crear tickets sin credencial,
y el acceso externo con identidad propia (`specs/acceso-clientes.md`) no tiene fecha.
Declararlo público habría sido escribir esa exposición en la lista y darla por buena.

---

## 12. Verificación contra código

Estado por afirmación tras U3 (15-sep-2026). Ninguna fila se ejerció contra el tenant
real ni contra la base real — la columna "evidencia" distingue qué tipo de verificación
respalda cada una.

| # | Afirmación a verificar | Dónde comprobarlo | Estado |
|---|---|---|---|
| V1 | La validación del `id_token` comprueba firma, emisor, audiencia, `nonce` y expiración, con `RS256` fijado | `src/server/auth/entra-oidc.ts` | **Verificado por test** (7 pruebas, `entra-oidc.test.mts`): cada paso rechaza de forma independiente, incluido `alg: none` |
| V2 | Solo una función crea sesiones y exige admisión previa | `src/server/auth/employee-session.ts` | **Verificado por inspección**: `grep` de `employeeSession.create` sobre `src/` devuelve una única aparición, dentro de `issueEmployeeSession` |
| V3 | El directorio se relee y las reglas se reevalúan en **cada** petición | `readEmployeeSession` | **Construido**, verificado por inspección (llama a `reevaluateAdmissionByPersonalId` en cada lectura). Sin test de integración: exige Postgres real |
| V4 | El enlace del sujeto inmutable no se sobrescribe nunca desde una petición | `issueEmployeeSession`, `updateMany({ where: { entraObjectId: null } })` | **Construido**, verificado por inspección. Sin test de integración: exige Postgres real con dos intentos de login reales |
| V5 | El perímetro deniega por defecto y la lista pública es exhaustiva | `src/proxy.ts`, `src/server/security/public-paths.ts`; `perimeter.test.mts` y `proxy.test.mts` | **Construido y verificado por test (U4):** ocho pruebas ejecutan `proxy()` sobre peticiones reales —incluida una ruta inexistente, que también se deniega— y seis enumeran `src/app` exigiendo que ninguna ruta quede sin clasificar y que toda privada resuelva identidad en su propio archivo. **Ejercitado contra el despliegue** el 22-sep-2026: ingreso por `/helpdesk` sin sesión y destino de retorno preservado |
| V6 | El destino de retorno se sanea en ambos extremos | `sanitizeDestination`, aplicado en `/start` y en `/login` | **Verificado por test** (5 pruebas, `sanitize-destination.test.mts`) más una corrección real hecha al llenar esta tabla: el callback no volvía a sanear `state.destino` antes del redirect final, solo confiaba en el sellado — corregido en la misma sesión |
| V7 | `prompt=none` protegido contra bucle por marca de un solo uso | `/api/auth/microsoft/start` | **Construido**, verificado por inspección (cookie `helpdesk_oidc_silent_attempted`). Sin ejercitar contra el proveedor real |
| V8 | No queda ninguna referencia a `REDIRECCION_PASSWORD` | `grep` sobre `src/` y sobre las variables de entorno | **Verificado (U4).** No es un `grep` manual: una prueba de la suite recorre `src/` y falla si el nombre reaparece, así que la propiedad se mantiene sola. La pantalla de acceso con clave y su cookie se eliminaron; la variable se retiró del servicio en Coolify, confirmado por el usuario |
| V9 | Pruebas negativas por cada causa de rechazo | `employee-admission.test.mts` | **Verificado por test**: las cuatro causas, más una prueba explícita de que ninguna combinación admite por defecto |
| V10 | Ninguna comparación de rol fuera del autorizador | `grep` de comparaciones de rol en componentes y handlers | **Verificado por inspección**: `grep` no encuentra ninguna comparación de `rolAplicacion` fuera de `evaluateAdmissionRules` — no hay autorizador de rol+acción todavía (`specs/permisos.md`, `U7`), solo la puerta binaria de admisión |

**Changelog:** 03-sep-2026 — línea base. Descarta el traspaso de token desde Conecta con
sus tres razones y la evidencia del modelo desacoplado ya vigente en Impulsa (§2);
adopta SSO silencioso con `prompt=none` como respuesta al requisito de fricción (§4);
registra que el directorio actual no puede sostener la admisión sin columnas nuevas
(§7.1); declara fuera de alcance el *grant* de correo, la suplantación y el selector de
empleados (§9).
- 15-sep-2026 (U3) — construido el contrato completo, con evidencia real (no
  suposición) de que Conecta no ofrece ningún mecanismo de federación de identidad:
  se inspeccionó su repositorio real antes de descartar la alternativa. §12 pasa de
  "sin verificar" a verificado por test/inspección según cada fila — V5 y V8 quedan
  explícitamente fuera de esta unidad (`U4`). Corregido durante la propia verificación
  de esta tabla: el destino de retorno no se saneaba en el extremo de lectura del
  callback, solo en el de sellado.
- 17-sep-2026 — **D6 resuelta.** El usuario confirma que HelpDesk necesitará enviar
  correo al cliente desde la cuenta de quien responde el ticket. Se agregan
  `offline_access` y `Mail.Send` al `scope` de la petición de autorización
  (`entra-oidc.ts`) para capturar el consentimiento desde este despliegue — el
  mecanismo de envío (grant delegado cifrado, equivalente a `graph-grant.ts` de
  Impulsa) queda pendiente, sin fecha, probablemente junto a `U7`. Queda abierta,
  sin decidir, la necesidad de `Mail.Send.Shared` para un eventual envío desde un
  buzón compartido de la firma (§9).
- 22-sep-2026 (U3, cierre) — el contrato pasa de construido a **ejercitado contra el
  despliegue**: seis escenarios de punta a punta en `/helpdesk`. `NOT_REGISTERED` y
  `EMAIL_INVALID` quedan con cobertura unitaria únicamente, y se dice por qué —
  reproducirlos exige una cuenta del tenant ausente del directorio o un `id_token` sin
  correo válido, y ninguna se puede fabricar contra Entra ID.
- 23-sep-2026 (U4) — **V5 y V8 dejan de estar fuera de alcance y quedan verificadas.**
  Existe perímetro: `src/proxy.ts` deniega por defecto y la lista pública vive en
  `public-paths.ts`, separada para que la prueba verifique la misma regla que el proxy
  aplica y no una copia. `REDIRECCION_PASSWORD` se retira del código y del servicio.
  Dos cosas que esta spec no había previsto: el portal de clientes se **retira** en vez
  de declararse público (§11), y el ingreso sin sesión entra por
  `/api/auth/microsoft/start` y no por `/login`, porque mandar a la pantalla con botón
  a quien ya trae sesión de Entra contradice el requisito de fricción de §4 — `/login`
  sigue siendo el destino de las peticiones que no son navegación de documento.

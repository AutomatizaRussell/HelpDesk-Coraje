# Acceso de empleados

```
ESTADO:      aprobado, NO implementado — no existe una línea de este contrato en
             `coraje-web/`. Lo que hay hoy es una contraseña compartida en
             `REDIRECCION_PASSWORD` que protege una sola ruta
CORTE:       03-sep-2026
EVIDENCIA:   ninguna sobre HelpDesk. Este documento describe comportamiento acordado,
             no observado. Las afirmaciones sobre `plataforma-impulsa` sí están
             verificadas por lectura directa de su código en el corte de esta fecha
MIGRACIÓN:   requiere columnas nuevas en `core.dim_personal` y dos tablas nuevas
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

| Situación | Qué ocurre |
|---|---|
| Llega desde Conecta con sesión de Entra viva | **Ningún clic.** Una redirección invisible al proveedor y vuelta con sesión de HelpDesk |
| Vuelve al día siguiente, sesión de Entra viva | **Ningún clic.** La sesión de HelpDesk expiró; la del tenant no |
| Sesión de Entra expirada, navegador nuevo o incógnito | Pantalla de Microsoft, una vez |
| Cuenta del tenant sin registro interno | Pantalla que nombra la causa y a quién pedir el alta |

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

## 9. Lo que este contrato **no** incluye

- **Envío de correo como el empleado.** Impulsa pide `Mail.Send` y `offline_access` en
  el mismo consentimiento y guarda un *grant* delegado cifrado, porque despacha correo
  a nombre de quien pulsó el botón, horas después y sin sesión. HelpDesk **no tiene hoy
  ese requisito**. Cuando lo tenga, pedir esos permisos después significa una segunda
  ronda de consentimiento por cada empleado: la decisión de incluirlos o no hay que
  tomarla **antes** del primer despliegue, no cuando aparezca la necesidad.
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

---

## 12. Verificación contra código

Todas las filas están **sin verificar**: no hay implementación. La tabla queda escrita
para la unidad que la construya.

| # | Afirmación a verificar | Dónde comprobarlo |
|---|---|---|
| V1 | La validación del `id_token` comprueba firma, emisor, audiencia, `nonce` y expiración, con `RS256` fijado | Módulo OIDC; orden de las comprobaciones |
| V2 | Solo una función crea sesiones y exige admisión previa | Emisor de sesión; ausencia de otros puntos de creación |
| V3 | El directorio se relee y las reglas se reevalúan en **cada** petición | Lector de sesión |
| V4 | El enlace del sujeto inmutable no se sobrescribe nunca desde una petición | Transacción de emisión |
| V5 | El perímetro deniega por defecto y la lista pública es exhaustiva | Proxy; prueba que enumere las páginas de `src/app` |
| V6 | El destino de retorno se sanea en ambos extremos | Sellado y lectura de la cookie de estado |
| V7 | `prompt=none` protegido contra bucle por marca de un solo uso | Ruta de inicio de autorización |
| V8 | No queda ninguna referencia a `REDIRECCION_PASSWORD` | `grep` sobre `src/` y sobre las variables de entorno |
| V9 | Pruebas negativas por cada causa de rechazo | Tests de admisión |
| V10 | Ninguna comparación de rol fuera del autorizador | `grep` de comparaciones de rol en componentes y handlers |

**Changelog:** 03-sep-2026 — línea base. Descarta el traspaso de token desde Conecta con
sus tres razones y la evidencia del modelo desacoplado ya vigente en Impulsa (§2);
adopta SSO silencioso con `prompt=none` como respuesta al requisito de fricción (§4);
registra que el directorio actual no puede sostener la admisión sin columnas nuevas
(§7.1); declara fuera de alcance el *grant* de correo, la suplantación y el selector de
empleados (§9).

# Integración con Conecta

```
ESTADO:      §2-§4 construidos (U5), cambios locales sin publicar al escribir este
             corte. §5 (endpoint en Conecta) diseñado, NO construido: pendiente
             de aprobación explícita del usuario para tocar RBGCT-REACT (rama
             `lulox`).
CORTE:       24-sep-2026
EVIDENCIA:   `pnpm test` 61/61 (entry-context, login-hint, proxy, perímetro),
             `tsc --noEmit`, `eslint` y `next build` limpios. Nada ejercitado
             todavía contra el despliegue ni contra Entra ID real.
```

**Autoridad:** decisiones del usuario del 23 y 24-sep-2026 recogidas aquí. Complementa
`acceso-empleados.md` (identidad propia, ningún token entre módulos) y
`contexto-canonico.md` §1.1 (HelpDesk parece parte de Conecta y cuelga de su URL).

**Referencia inspeccionada:** RBGCT-REACT `cb06681` (21-sep-2026), que es a la vez
`main`, `stiben` y `lulox`. Coolify despliega Conecta desde `main`, a mano. Acceso de
lectura concedido a `Daniezen` el 24-sep-2026. **Regla vigente:** en Conecta no se
cambia nada sin petición o aprobación explícita del usuario, y un cambio aprobado va en
`lulox`.

## 1. El problema

HelpDesk y Conecta son dos aplicaciones con servidor, base y sesión propios que
comparten dominio: `conecta.rbgct.cloud/app` y `conecta.rbgct.cloud/helpdesk`. HelpDesk
replica el menú de Conecta, pero dibujarlo igual exige datos que solo Conecta tiene:

| Dato | Para qué | Dónde vive |
|---|---|---|
| Correo de la cuenta | Que Microsoft entre sin preguntar entre varias cuentas | Conecta: backend y navegador |
| Primer nombre + primer apellido | Nombre en topbar y tarjeta («DANIEL LOPERA») | Conecta: backend y navegador |
| Área o cargo | Subtítulo de la tarjeta | Conecta: backend y navegador |
| Permisos `acceso_sqf_*` | Que aparezca «Mis clientes» | Conecta: backend y navegador |
| Cursos vigentes | Que aparezca «Formación» | **Solo** el backend de Conecta, calculado por persona |

HelpDesk tiene `nombre_completo` en una sola cadena. No se puede partir en «primer
nombre + primer apellido» sin equivocarse con los nombres compuestos.

## 2. Dos modos de entrada

Se decide **al entrar** y queda fijo durante la sesión de HelpDesk (8 h). El cierre de
sesión lo olvida.

| | Desde Conecta | Directo |
|---|---|---|
| Cuándo | El navegador tiene `gct_empleado` con correo | Cualquier otro caso |
| Ingreso | **Sin clics**: silencioso con la cuenta de Conecta como `login_hint` | Pantalla `/login`; el botón abre el **selector de cuenta** (`prompt=select_account`) |
| Si Entra rechaza el silencioso | Pantalla de Microsoft con la cuenta sugerida (`hinted`) | — |
| Shell | Réplica del de Conecta (columna replegada, topbar, sidebar) | Barra propia de HelpDesk con logotipo, sin nada de Conecta |
| Navegación de HelpDesk | Pestañas bajo la topbar | Las mismas pestañas bajo la barra |

**Recorrido sin sesión:**

```
navegación → proxy (sin cookie) → /ingreso (navegador)
   ├─ hay gct_empleado → POST /api/auth/microsoft/start → Entra prompt=none + login_hint
   │                       └─ rechazo → callback → Entra con login_hint (interactivo)
   └─ no hay            → /login → botón → GET start?silent=0 → Entra prompt=select_account
callback → admisión → cookie de sesión + cookie de entrada (modo y perfil)
```

**Qué no detecta, y por qué es aceptable.** La señal es la ficha `gct_empleado`, no la
validez de la sesión de Conecta. Conecta la borra al cerrar sesión (`AuthContext.jsx`),
pero si su sesión caduca sin cerrarla, la ficha sigue ahí. En ese caso HelpDesk entra en
modo Conecta y los enlaces del menú llevarán a la pantalla de ingreso de Conecta. No hay
riesgo de seguridad: la ficha solo sugiere la cuenta y decide qué se pinta (§4).

## 3. El dato del navegador (`gct_empleado`)

Conecta guarda la ficha del empleado en `localStorage` al iniciar sesión. Los navegadores
separan ese almacenamiento **por origen**, y HelpDesk comparte origen con Conecta, así que
puede leerla sin llamar a su servidor.

**Solo se lee en `/ingreso`** (`features/ingreso/EntryHandoff.tsx`), y solo nueve campos:
`correo_corporativo`, `primer_nombre`, `primer_apellido`, `nombre_area`, `nombre_cargo`
y los cuatro `acceso_sqf_*`. Nunca los tokens de Conecta, que viven en el mismo
almacenamiento.

**Viaja por POST, no por la URL**, para que el correo y el nombre no queden en los
registros del proxy ni en el historial del navegador. El servidor responde 303, no 307,
para que el navegador no repita ese POST contra Microsoft.

## 4. Reglas del dato del navegador — no negociables

Implementadas en `server/auth/entry-context.ts` y probadas en `entry-context.test.mts`.

1. **Solo para mostrar, nunca para autorizar.** Decide qué nombre se pinta y qué enlaces
   a Conecta aparecen, jamás un permiso de HelpDesk. Conecta protege sus propias rutas:
   ver «Mis clientes» sin permiso solo llevaría a una pantalla que Conecta niega.
2. **Solo de la misma persona.** El callback descarta el perfil si su correo no coincide
   con el de la cuenta que Microsoft y el directorio acaban de admitir. En un navegador
   compartido, no se muestra el nombre de otro empleado.
3. **Mínimo y acotado.** Esquema `zod` con longitudes máximas; un JSON de más de 4 KB, mal
   formado o con tipos inesperados produce «sin perfil».
4. **Fallo cerrado.** Sin perfil válido, HelpDesk pinta sus propios datos. Este contexto
   nunca puede romper el ingreso.
5. **Sellado en la sesión.** Tras admitir, modo y perfil se guardan en una cookie sellada
   (`helpdesk_entry`, `httpOnly`, acotada a `/helpdesk`). No porque sea secreto, sino para
   que el servidor pinte solo lo que el servidor decidió.

## 5. Endpoint en Conecta — `PROPUESTA`, no construido

**Para qué:** lo único que el navegador no tiene, «Formación», y con el tiempo un dato
oficial y siempre actualizado, aunque la persona no haya abierto Conecta en ese
navegador.

**Lo que no resuelve:** ni el selector de cuenta (el servidor de HelpDesk solo puede
preguntar *después* de saber quién es la persona) ni la detección del modo de entrada
(solo la conoce el navegador). Por eso **complementa** §3 y no la sustituye.

**Diseño propuesto:** `GET /api/integraciones/helpdesk/empleado?correo=…` en el backend
Django de Conecta. Lo llama el servidor de HelpDesk, una vez al admitir, y el resultado
se guarda en la cookie de entrada. Nunca una llamada por página.

### 5.1 Controles obligatorios

| Riesgo | Por qué existe | Control |
|---|---|---|
| **Credencial con poder total sobre Conecta** | Las API keys actuales (`sistema.ApiKey`, cabecera `X-API-Key`) autentican como el SuperAdmin que las creó y valen en **todas** las rutas; su campo `permisos` no se aplica | Clase de autenticación **nueva** para este endpoint, que no entrega un SuperAdmin como usuario. Alcance explícito `helpdesk.sidebar` comprobado en el endpoint. Excluir esas claves del resto de rutas (`DEFAULT_AUTHENTICATION_CLASSES` no debe aceptarlas) |
| **Directorio expuesto si la clave se filtra** | Con la clave se podría pedir la ficha de cualquier empleado | Respuesta mínima: nombre corto, área o cargo, `sqfAccess`, `tieneFormacion`. Solo empleados `ACTIVA`; un correo desconocido o inactivo responde igual que uno sin datos. Límite de consultas propio (no el cupo compartido del SuperAdmin). Registro de cada uso con fecha y correo consultado |
| **La consulta pasa por internet** | La vía simple es `https://conecta.rbgct.cloud/api/...`, pública y protegida solo por la clave. `ip_permitidas` se puede falsear: Conecta toma el primer `X-Forwarded-For` y su nginx conserva el que envía el cliente | Clave de alta entropía y rotable, **solo** en cabecera y nunca en la URL. No confiar en `ip_permitidas` mientras la cabecera no se sanee. La alternativa, la red interna de Docker, acopla los despliegues de ambas apps; se descarta salvo necesidad |
| **Un secreto más que custodiar** | Vive en dos recursos de Coolify | Procedimiento de rotación en `estado/operacion.md`: crear la nueva, desplegar HelpDesk, revocar la vieja. Nunca en el repositorio |
| **Conecta caído o lento arrastra a HelpDesk** | El menú dependería de su respuesta | Tiempo de espera corto (≤ 2 s). Si falla, datos del navegador (§3) o propios. **Nunca bloquear el ingreso** |
| **La persona equivocada** | Se cruza por correo | Correo normalizado en minúsculas; sin coincidencia exacta, sin datos. Mismo fallo cerrado que §4 |

### 5.2 Cursos: el cálculo que hay que respetar

Si hay cursos vigentes o no **depende de la persona**. `CursoViewSet.get_queryset`
(`backend/api/views/cursos.py`) filtra por visibilidad (todos, área, nivel de cargo,
persona o asignación), exclusiones y ventana de fechas. Llamar a `/api/cursos/` con una
clave devolvería todos los cursos, porque la clave entra como SuperAdmin. El endpoint
tiene que aplicar ese mismo filtro para el empleado consultado y devolver solo un
booleano.

### 5.3 Qué falta para construirlo

1. Aprobación explícita del usuario sobre el diff concreto en `lulox`.
2. Que alguien del equipo de Conecta lo lleve a `main` y lo despliegue: Coolify
   despliega Conecta desde `main`, a mano.
3. Del lado de HelpDesk: el cliente con tiempo de espera, el uso de la respuesta en el
   callback y la fila en el runbook.

## 6. Riesgo que existe con cualquier opción

Compartir origen con Conecta, que es la decisión D7 de colgar de su URL, significa que el
código de cada app puede leer **todo** lo que la otra guarda en el navegador, incluidos
los tokens de sesión de Conecta. Un fallo de tipo XSS en cualquiera de las dos
compromete a ambas. Leer `gct_empleado` no crea este riesgo, solo lo hace visible.
Mitigación: la disciplina de siempre contra XSS, sin `dangerouslySetInnerHTML` ni HTML
de terceros, y una política de seguridad de contenido cuando HelpDesk renderice
contenido de clientes.

## 7. Verificación contra código

| # | Afirmación | Dónde | Estado |
|---|---|---|---|
| I1 | Sin sesión, toda navegación de documento pasa por `/ingreso` | `proxy.ts`, `proxy.test.mts` | Verificado (prueba) |
| I2 | `/ingreso` es público y está en el inventario del perímetro | `public-paths.ts`, `perimeter.test.mts` | Verificado (prueba) |
| I3 | El modo directo obliga a elegir cuenta y nunca envía pista | `entra-oidc.ts`, `login-hint.test.mts` | Verificado (prueba) |
| I4 | El perfil de Conecta se valida con esquema y falla cerrado | `entry-context.ts`, `entry-context.test.mts` | Verificado (prueba) |
| I5 | El perfil solo se conserva si su correo es el de la cuenta admitida | `callback/route.ts`, `bindProfileToIdentity` | Verificado (prueba de la función; el callback sin ejercitar) |
| I6 | Solo viajan los nueve campos, por POST | `EntryHandoff.tsx` | Inspección; sin ejercitar |
| I7 | Con sesión de Conecta se entra sin selector aunque haya varias cuentas | Despliegue + Entra real | **Pendiente** |
| I8 | Cerrar sesión borra el modo de entrada | `sign-out-action.ts`, `logout/route.ts` | Inspección; sin ejercitar |
| I9 | Endpoint de Conecta con los controles de §5.1 | RBGCT-REACT | **No construido** |

**Changelog:** 24-sep-2026 — línea base. Modos de entrada (§2), dato del navegador y sus
reglas (§3-§4) construidos; endpoint de Conecta diseñado con sus controles (§5),
pendiente de aprobación.

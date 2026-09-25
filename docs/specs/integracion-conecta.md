# Integración con Conecta

```
ESTADO:      Opción 3 DECIDIDA (§1.1): navegador y endpoint, las dos partes.
             Parte 1 (§2-§4) construida, publicada (`47886bd`) y ejercitada.
             Parte 2 (§5, endpoint en Conecta) decidida y diseñada, PENDIENTE
             DE CONSTRUIR (U5.2). Toca RBGCT-REACT, así que su diff concreto se
             presenta al usuario antes de escribirlo (§1.2)
CORTE:       24-sep-2026
EVIDENCIA:   `pnpm test` 62/62 (entry-context, login-hint, proxy, perímetro),
             `tsc --noEmit`, `eslint` y `next build` limpios. **Ejercitado por el
             usuario contra el despliegue, 24-sep-2026:** entrada desde Conecta
             sin selector de cuenta, con nombre corto, área y «Mis clientes»;
             entrada directa con `/login`, selector y barra propia
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

## 1.1 `DECISIÓN` Opción 3: navegador **y** endpoint (24-sep-2026, usuario)

Se evaluaron tres formas de obtener los datos de §1:

| Opción | Qué es | Cubre | No cubre | Riesgo nuevo |
|---|---|---|---|---|
| 1 · Navegador | Leer `gct_empleado` del `localStorage` que Conecta comparte por origen (§3) | Sugerir la cuenta a Microsoft (sin selector), detectar si se viene de Conecta, nombre corto, área, «Mis clientes» | «Formación»; personas que nunca abrieron Conecta en ese navegador; datos si Conecta cambia su clave interna | Ninguno de seguridad (§4); acoplamiento a una clave interna de Conecta |
| 2 · Endpoint | El servidor de HelpDesk pregunta al backend de Conecta (§5) | Nombre, área, «Mis clientes» y «Formación», oficiales y siempre al día | **El selector de cuenta** (el servidor solo pregunta *después* de saber quién es la persona) y **la detección del modo** (solo la conoce el navegador) | **Sí**: una credencial nueva hacia Conecta y un directorio consultable (§5.1) |
| **3 · Ambas** | 1 para lo que solo sabe el navegador; 2 para el dato oficial y «Formación» | Todo | — | El de 2, acotado por los controles obligatorios de §5.1 |

**Elegida la opción 3, completa: las dos partes son parte de la decisión.** Ninguna es
opcional ni futura. Se necesitan las dos porque cada una resuelve lo que la otra no
puede:

- **la 1** (navegador) es la única que puede evitar el selector de cuenta y detectar si
  se viene de Conecta;
- **la 2** (endpoint) es la única que da el dato oficial y «Formación».

**Orden de construcción.** La 1 se construyó primero porque no tocaba Conecta. La 2 se
construye con **todos** los controles de §5.1 como condición no negociable: el usuario
pidió «el mayor cuidado del mundo» con ella. Como toca RBGCT-REACT, rige §1.2: su diff
concreto se le presenta antes de escribirlo, y va en `lulox`. Es un paso de
procedimiento, no una decisión pendiente.

**Estado de cada parte:**
- parte 1: construida y ejercitada (§2-§4);
- parte 2: decidida y diseñada, **pendiente de construir** (§5; unidad U5.2 de
  `estado/plan-ejecucion.md`);
- «Formación» no aparece hasta que la parte 2 esté construida.

## 1.2 `INVARIANTE` Conecta no se toca sin permiso

**RBGCT-REACT es de otro equipo, está en producción y la usa toda la firma.** Desde
HelpDesk se lee; nunca se escribe por iniciativa propia.

- Permitido sin preguntar: `git fetch`, alinear la copia local con el remoto, `git show`,
  leer archivos y descargar los archivos públicos que sirve el sitio.
- **Todo lo demás exige aprobación explícita del usuario**: commit, push, checkout de
  trabajo, cambio de configuración de la copia local, o cualquier petición que escriba
  en Conecta (su API, su base). La aprobación vale para el cambio concreto presentado,
  no para los siguientes.
- Un cambio aprobado va **solo** en la rama `lulox` (la del usuario), nunca en `main` ni
  en `stiben`. Coolify despliega Conecta desde `main`, a mano: llevarlo ahí es trabajo del
  equipo de Conecta.
- `Daniezen` tiene acceso **Read** al repositorio (24-sep-2026). Si un push de esa cuenta
  llegara a funcionar, el permiso estaría mal configurado: avisar, no aprovecharlo.

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

## 5. Endpoint en Conecta — `DECIDIDO`, pendiente de construir (U5.2)

**Para qué:** lo único que el navegador no tiene, «Formación», y con el tiempo un dato
oficial y siempre actualizado, aunque la persona no haya abierto Conecta en ese
navegador.

**Lo que no resuelve:** ni el selector de cuenta (el servidor de HelpDesk solo puede
preguntar *después* de saber quién es la persona) ni la detección del modo de entrada
(solo la conoce el navegador). Por eso **complementa** §3 y no la sustituye.

**Diseño:** `GET /api/integraciones/helpdesk/empleado?correo=…` en el backend
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
| **Permisos de clave que no se aplican** | El modelo `ApiKey` de Conecta tiene un campo `permisos` (JSON), pero ningún código lo comprueba: solo lo devuelve la acción `verify`. Una clave «limitada» hoy no está limitada en nada | El alcance del endpoint se comprueba **en código**, en su clase de permiso propia. No confiar en el campo `permisos` hasta que Conecta lo aplique |
| **Cupo de peticiones compartido con el SuperAdmin** | `UserRateThrottle` agrupa por usuario, y una clave entra como el SuperAdmin que la creó: HelpDesk y ese administrador comparten cupo | Límite propio del endpoint, asociado a la clave y no al usuario |
| **Clase de autenticación antigua duplicada** | `backend/api/authentication.py` define un `ApiKeyAuthentication` viejo que busca `ApiKey.objects.get(key=...)`, un campo que ya no existe. Nadie lo importa hoy | No importarla ni tomarla de modelo. Señalarla al equipo de Conecta para que la retire: un import equivocado la reactivaría |
| **Ruta interna de Docker** | El nombre `backend` solo resuelve en la red de Conecta, y `ALLOWED_HOSTS` solo admite ciertos nombres | Si algún día se llama por la red interna: unir redes a propósito y añadir el host exacto a `ALLOWED_HOSTS`, nunca con comodines |

### 5.2 Cursos: el cálculo que hay que respetar

Si hay cursos vigentes o no **depende de la persona**. `CursoViewSet.get_queryset`
(`backend/api/views/cursos.py`) filtra por visibilidad (todos, área, nivel de cargo,
persona o asignación), exclusiones y ventana de fechas. Llamar a `/api/cursos/` con una
clave devolvería todos los cursos, porque la clave entra como SuperAdmin. El endpoint
tiene que aplicar ese mismo filtro para el empleado consultado y devolver solo un
booleano.

### 5.3 Qué falta para construirlo

1. Presentar al usuario el diff concreto en `lulox` y obtener su aprobación (§1.2). Es
   procedimiento, no decisión: la decisión ya está tomada.
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
| I7 | Con sesión de Conecta se entra sin selector aunque haya varias cuentas | Despliegue + Entra real | **Ejercitado** por el usuario, 24-sep-2026 |
| I8 | Cerrar sesión borra el modo de entrada | `sign-out-action.ts`, `logout/route.ts` | Inspección; sin ejercitar |
| I9 | Cerrar sesión en HelpDesk lleva a Conecta (`/app`) en los dos modos de entrada, sin cerrar la sesión de Conecta (decisión del 25-sep-2026) | `server/auth/conecta-return.ts` | Construido (corte 18); sin ejercitar |
| I9 | Endpoint de Conecta con los controles de §5.1 | RBGCT-REACT | **Decidido, pendiente de construir** (U5.2) |

**Changelog:**
- 24-sep-2026 — línea base. Modos de entrada (§2) y dato del navegador con sus reglas
  (§3-§4) construidos; endpoint de Conecta diseñado con sus controles (§5).
- 24-sep-2026 (mismo día) — **corrección del usuario:** la opción 3 incluye la 2 como
  parte de la decisión, no como propuesta. El endpoint pasa a `DECIDIDO`, pendiente de
  construir (U5.2). §5.1 gana cuatro controles que salieron del análisis del backend de
  Conecta: permisos de clave no aplicados, cupo compartido, clase antigua duplicada y
  ruta interna.

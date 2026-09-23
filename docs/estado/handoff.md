# Handoff técnico

```
CORTE:   23-sep-2026 (corte 13, U4 CERRADA)
HEAD:    `1937589` — más la documentación de este corte, que se publica encima
RAMA:    main
UNIDAD:  U4 · PERÍMETRO Y RETIRO DE LA CLAVE COMPARTIDA — **CERRADA.** Las dos
         condiciones de cierre de `plan-ejecucion.md` §U4 se cumplen y están
         verificadas: una prueba enumera las páginas de `src/app` y exige que
         cada una fuera de los prefijos públicos resuelva identidad, y el
         `grep` de la clave compartida dejó de ser manual — una prueba falla
         si el nombre reaparece en `src/`.

         Existe perímetro: `src/proxy.ts` deniega por defecto y la lista
         pública vive en `src/server/security/public-paths.ts`, con dos
         entradas (`/login` y `/api/auth/microsoft`). La regla se separó del
         proxy a propósito, para que la prueba verifique **la misma función**
         que el perímetro aplica y no una copia que pueda divergir; por el
         mismo motivo el nombre de la cookie de sesión se trasladó a un
         módulo sin dependencias, ya que el runtime del borde no puede cargar
         el módulo de sesión (arrastra Prisma). Dos capas declaradas: el proxy
         comprueba **presencia** de cookie, `readEmployeeSession` decide
         validez. Poner una consulta a PostgreSQL por petición se descartó
         explícitamente por economía de recursos.

         **Dos decisiones que la unidad tomó y no heredó.** El portal de
         clientes **se retiró, no se declaró público** —decisión del usuario,
         con la constancia de que ningún cliente lo usa—: era una superficie
         anónima en dominio público que listaba clientes con identificación
         fiscal y creaba tickets sin credencial, y la identidad que iba a
         protegerla (`U8`) está bloqueada por D2/D3/D4, sin fecha. Y el
         ingreso sin sesión entra por `/api/auth/microsoft/start` y no por
         `/login`, porque mandar a la pantalla con botón a quien ya trae
         sesión viva de Entra contradice el requisito de fricción de
         `acceso-empleados.md` §4.

         **Trabajo adicional pedido por el usuario en la misma sesión
         (`1937589`), fuera del objetivo de U4: se retiró el frontend heredado
         completo** — las dos vistas de redirección, el `AppShell` con su
         paleta escrita en la vista, las tablas, el formulario,
         `features/tickets/` (ya código muerto), los tokens de `globals.css` y
         las fuentes de plantilla del layout. Nada se sustituyó por nada: los
         valores visuales son competencia de `U5`. Quedan cinco rutas: `/`,
         `/login` y las tres de autenticación. La lógica de redirección se
         conservó **sin pantalla** en `features/redireccion/`, por ser el
         único sitio donde están escritas enteras la resolución del encargado
         y la forma del registro del outbox; al no importarla nadie, Next no
         publica endpoint para ella.

         **Evidencia:** `tsc --noEmit`, `eslint` y `next build` limpios —el
         build reconoce el proxy—, 42/42 pruebas unitarias, de las que ocho
         ejecutan `proxy()` sobre peticiones fabricadas. Contra el despliegue,
         cuatro escenarios reportados por el usuario: ingreso por `/helpdesk`
         con el perímetro activo, ausencia de las pantallas retiradas, destino
         de retorno preservado y variable borrada del servicio en Coolify.

         **Lo que NO está verificado, y conviene no olvidarlo:** cómo llega el
         prefijo `/helpdesk` al pathname dentro del proxy real. No se
         demostró, se neutralizó —`normalizeAppPathname` clasifica igual venga
         puesto o no—. Es la salvedad 4 de §1.

         **U5 pasa a ser la cabeza de la cola, y arranca sin decisión de
         usuario pendiente:** D5 se cerró al terminar esta sesión —HelpDesk
         lleva **acento visual propio**, no el de Impulsa—. Qué acento
         exactamente es trabajo de U5, no consulta.

CORTE ANTERIOR (22-sep-2026, corte 12): U3 · IDENTIDAD DE EMPLEADOS — **CERRADA Y EJERCITADA CONTRA EL
         DESPLIEGUE REAL.** Los ocho escenarios mínimos de `plan-ejecucion.md`
         §U3 quedan resueltos: **seis ejercitados de punta a punta el
         22-sep-2026** contra `https://conecta.rbgct.cloud/helpdesk`, y dos
         (`NOT_REGISTERED`, `EMAIL_INVALID`) cubiertos **solo por prueba
         unitaria** — no se declaran ejercitados, y la razón queda en §4.

         Lo que faltaba del corte anterior era infraestructura, y se hizo: la
         regla de enrutamiento en Traefik de Coolify, más el redirect URI de
         Entra y `ENTRA_REDIRECT_URI` alineados a `/helpdesk`. Al ejercitarla
         apareció un defecto que solo el despliegue real podía revelar —las
         redirecciones internas se construían sobre `request.url`, que detrás
         del proxy vale `0.0.0.0:3000`—, corregido en `306d286` con `Location`
         relativo. **U4 pasa a ser la cabeza de la cola**; ver "Acción
         inmediata para la siguiente sesión" más abajo.

         Implementa el núcleo de `specs/acceso-empleados.md`: flujo OIDC con PKCE
         contra Entra ID (SSO silencioso vía `prompt=none`, con reintento
         explícito tras `login_required`/`interaction_required` y cookie
         anti-bucle de un solo uso); validación completa del `id_token` en el
         orden exigido (firma `RS256` fijada → emisor → audiencia → nonce →
         expiración con holgura de 120s); admisión contra `core.dim_personal` con
         las cuatro causas de rechazo cerradas (`EMAIL_INVALID`/`NOT_REGISTERED`/
         `INACTIVE`/`UNKNOWN_ROLE`); sesión propia opaca en `app.employee_session`
         (8h absolutas, sin renovación deslizante, releyendo admisión en cada
         lectura); saneo del destino de retorno contra *open redirect*.

         Esquema: `dim_personal` gana `rol_aplicacion` (enum con un único valor,
         `AGENTE` — el catálogo fino de roles es competencia de
         `specs/permisos.md`, todavía sin cerrar) y `entra_object_id` (sujeto
         inmutable, enlazado una sola vez, nunca sobrescrito). Nuevo schema
         `app` en PostgreSQL para `employee_session` — estado propio de la
         plataforma, separado de `core`/`helpdesk` — con `GRANT` explícito a
         `coraje_runtime`. Migración escrita a mano (mismo motivo que el
         baseline: sin acceso a la base real desde este entorno de trabajo).

         **D7 (`contexto-canonico.md` §1.1) se resuelve en esta unidad, con
         evidencia real, no por suposición.** Se clonó el repositorio real de
         Conecta (`RBGCT-REACT`, autorizado por el usuario) para decidir si
         HelpDesk debía apoyarse en su login: `main` (lo desplegado en Coolify)
         no usa Entra ID — es JWT propio (HS256, email+contraseña+2FA); una rama
         de trabajo (`stiben`, 127 commits por delante, no mergeada) agrega un
         botón de Microsoft, pero incluso ahí Conecta emite su propio JWT, nunca
         una sesión de Entra. Confirmado además, por lectura de
         `nginx/nginx-proxy.conf` y `docker-compose.prod.yml`, que Conecta no
         actúa como *reverse proxy* ni federa identidad hacia otros módulos. Se
         descarta acoplar HelpDesk a Conecta — mismas razones que
         `specs/acceso-empleados.md` §2 ya daba para el traspaso de token — y se
         confirma que Conecta también autentica contra el mismo tenant de
         Microsoft 365, lo que sostiene el diseño de SSO silencioso: sin tocar
         Conecta, la persona deja de ver una segunda pantalla en cuanto ambos
         módulos hablen con el mismo Entra ID.

         **Alcance deliberadamente fuera de esta unidad:** el perímetro global
         *deny-by-default* y el retiro de `REDIRECCION_PASSWORD` (`U4`, según
         `plan-ejecucion.md` — `/portal` y `/redireccion` no se tocaron); el
         catálogo fino de roles y el autorizador ejecutable (`specs/permisos.md`,
         `U7`).

         **Evidencia real de esta unidad:** `prisma generate`, `tsc --noEmit`,
         `eslint` y `next build` limpios; 26/26 pruebas unitarias (`pnpm test`,
         `node --test` vía `tsx`) cubriendo el orden de validación del
         `id_token`, las cuatro causas de rechazo de admisión y el saneo de
         destino. **Y, desde este corte, comportamiento observado contra el
         despliegue:** ingreso real, cierre de sesión, expulsión por
         desactivación, rechazo por rol ausente, cookie de sesión manipulada
         sin efecto, destino de retorno saneado, y el enlace del sujeto
         inmutable confirmado en `core.dim_personal`. Detalle en §4.

CORTE DOS ANTES (18-sep-2026, corte 11): se resuelve D7 en sus tres preguntas y el
         prefijo cambia de `/app/HelpDesk` a `/helpdesk` (`cfce427`), tras
         confirmar por lectura del repositorio real de Conecta que `/app` es su
         propio portal de empleados —no un path libre del dominio— y que un
         prefijo de caja mixta falla en silencio. Se descarta la composición en
         tiempo de request: Conecta es un SPA de Vite servido como estáticos,
         sin layout de servidor donde inyectar un fragmento; el shell se
         replica dentro de HelpDesk (`U5`).

CORTE TRES ANTES (11-sep-2026, corte 8): **U2 cierra** con los cuatro escenarios
         mínimos de `plan-ejecucion.md` cerrados y verificados: baseline
         adoptado (corte 6) · credenciales separadas, incluida la corrida real
         de n8n con `coraje_etl` (corte 7) · servicio `migrate` desplegado y
         gateando `web` de verdad, confirmado en logs reales de Coolify (esta
         entrada) · una escritura real confirmada con `coraje_runtime` — el
         usuario creó un ticket real desde el portal y probó la redirección.
         **U3 pasó a ser la cabeza de `plan-ejecucion.md`.**

CORTE CUATRO ANTES (11-sep-2026, corte 7): verificación previa a escribir el `GRANT`
         revela que `coraje_app` era superusuario y el único rol de aplicación del
         clúster — se amplía F6 para retirarlo también de n8n. Creados
         `coraje_migrator`, `coraje_runtime`, `coraje_etl`; `coraje_app` rotado y
         reservado a emergencias humanas. Dos incidencias de exposición de
         credenciales, ambas resueltas (contraseña original pegada en el chat;
         los tres roles nuevos creados con placeholders sin sustituir, corregido
         con `\password` interactivo). La corrida real de n8n reveló dos huecos
         más (ownership de `staging`, `CREATE INDEX` embebido contra `core`),
         corregidos. Detalle completo en el changelog.

CORTE CINCO ANTES (11-sep-2026, corte 6, publicado en `1e4a6a8`): se escribe
         `schema.prisma` (14 modelos `PascalCase`+`@@map`) y la migración a mano
         `20260910000000_baseline/migration.sql`, se migran 20 archivos de
         aplicación a `camelCase`, y se adopta la migración contra producción con
         `prisma migrate resolve --applied` (`applied_steps_count = 0`, sin
         ejecutar DDL). Detalle completo en el changelog.
STAGING: no aplica. No hay entorno de pruebas declarado para este proyecto
LINT:    limpio (`eslint`, sin reglas nuevas). `tsc --noEmit` y `next build`
         también limpios — validado en local con FNM (Node 24.16.0) y pnpm
         11.2.2, no solo por inspección. Sin `DATABASE_URL` real disponible desde
         este entorno, `next build` corrió con el mismo dummy que usa la etapa
         `builder` del `Dockerfile`
PRUEBAS: 42/42 (`pnpm test`). Al borrar rutas hay que **regenerar `.next`** antes
         de `tsc --noEmit`: los tipos de ruta que Next deja en `.next/types`
         siguen apuntando a las páginas eliminadas y producen errores que no
         existen en el código
```

**Qué es este documento:** el estado observado, la evidencia disponible, las
incertidumbres y **una sola acción inmediata**, con fecha de corte explícita. No
contiene decisiones estables (`contexto-canonico.md`), contratos funcionales (`specs/`),
runbook operativo (`estado/operacion.md`) ni la cola de trabajo
(`estado/plan-ejecucion.md`).

**Cómo se actualiza:** la **estructura** —secciones y campos— es durable y no cambia. La
**instantánea** —todo su contenido— se reemplaza al cerrar cada unidad, siguiendo §8.

## 1. Veredicto operativo

**Lo que está cerrado:** el conjunto documental existe, es coherente y cada afirmación
sobre el código está marcada como verificada o como pendiente de verificar.

**Lo que cambió con U3:** HelpDesk tiene identidad de empleados real, **en uso**. Deja
de ser código construido y pasa a ser comportamiento observado: una persona entra con su
cuenta corporativa, la aplicación emite su propia sesión, la revoca al salir, y
desactivar a alguien en el directorio lo expulsa en su siguiente navegación sin esperar
a que caduque nada. Es la primera pieza del proyecto con ese grado de evidencia.

**Lo que cambió con U4:** esa identidad pasó de existir a ser **obligatoria**. Hay
perímetro: toda ruta es privada salvo dos, y la lista de excepciones es un archivo que
alguien tiene que editar a la vista de todos. Desaparecieron las dos formas de entrar
que no eran identidad — la clave compartida de redirección y el portal de clientes sin
credencial—, y con ellas la única superficie del proyecto que leía datos de clientes y
escribía tickets sin saber quién lo pedía. En la misma sesión se retiró el frontend
heredado completo: la aplicación tiene hoy cinco rutas y ni un valor visual escrito.

**Salvedades sobre lo que parece cerrado.** Cinco, ninguna cosmética:

1. **Dos de las cuatro causas de rechazo siguen sin prueba real.** `NOT_REGISTERED`
   exige una cuenta del tenant ausente de `dim_personal`, y `EMAIL_INVALID` un
   `id_token` sin correo válido, que no se puede producir contra Entra a mano. Ambas son
   reglas puras en `evaluateAdmissionRules`, cubiertas por la suite unitaria. Se cierran
   como **cobertura unitaria**, no como escenario ejercitado.
2. **Autorización sigue sin existir.** `rol_aplicacion` tiene un único valor y nadie
   consulta permisos: entrar es todo lo que hoy se decide. El autorizador ejecutable es
   `U7`.
3. ~~**El perímetro sigue abierto.**~~ **Cerrada el 22-sep-2026 (U4).** `/portal` se
   retiró y `/redireccion` quedó detrás de identidad antes de retirarse también con el
   frontend heredado. No queda ninguna forma de entrar que no sea la sesión de empleado.
4. **El perímetro no se autoverifica en ejecución.** Las pruebas ejercitan `proxy()`
   como función, no el despliegue: que el prefijo `/helpdesk` llegue descontado del
   pathname dentro del proxy real **no está demostrado**, solo neutralizado —
   `normalizeAppPathname` clasifica igual venga puesto o no. Se ejercitaron cuatro
   escenarios contra el dominio y ninguno falló, pero un caso que dependa de esa
   diferencia podría no haberse tocado. La forma de que deje de importar es que ninguna
   ruta futura dependa del prefijo, no una prueba más.
5. **Con el frontend retirado, la aplicación no hace nada todavía.** Entrar es todo lo
   que se puede hacer: no hay bandeja, ni ficha, ni forma de clasificar un ticket. Es
   deliberado —lo que había era del proyecto anterior y se rehace desde el contrato de
   diseño (`U5`)— pero conviene decirlo sin adornos: el proyecto retrocedió en
   funcionalidad visible a cambio de no construir sobre una base que iba a tirarse.

Contrato de diseño y ciclo de vida del ticket siguen sin existir, y escribir la
especificación no adelanta la implementación. Tres de las cinco specs están además
**bloqueadas por hechos que nadie ha medido**, no por trabajo pendiente: sin el
levantamiento de PowerApps (U0), lo que se construya será diseño por analogía.

## 2. Estado por fase

| Fase | Estado | Evidencia o bloqueo |
|---|---|---|
| Ingesta SharePoint → PostgreSQL | `EJERCITADO, con el código corregido de esta unidad` | 2.313 tickets conciliados en `legacy/baseline-calidad.md` (baseline histórico, no se edita) → 2.559 el 10-sep-2026 antes de esta unidad → **2.825 el 10-sep-2026 tras ejecutar la ingesta con el fix de F10** (§4). El crecimiento es la ingesta incremental real, confirmado por el usuario — no es un error de conteo |
| Salida PostgreSQL → SharePoint | `CONSTRUIDO, ACTIVO, NUNCA EJERCITADO` | Ningún cliente radicó nunca — el outbox sigue en 0 filas (U1 §5). El workflow consumidor **existe, está commiteado y confirmado activo en n8n** (F5 cerrado), pero nadie lo ha visto procesar un ticket real todavía |
| Portal de clientes | `RETIRADO, SIN SUSTITUTO` | Eliminado el 22-sep-2026 (U4, `735be57`): las tres páginas, la API de clientes, la cookie de cliente y `features/portal/`. **HelpDesk no tiene hoy canal externo de recepción**; construirlo es `U8`, bloqueado por D2/D3/D4 |
| Redirección interna | `RETIRADA` | La clave compartida y su pantalla se eliminaron (`735be57`); las dos vistas cayeron con el frontend heredado (`1937589`). La lógica —resolución del encargado y escritura en el outbox— se conservó sin pantalla en `features/redireccion/`, como referencia para `U7` |
| Perímetro de acceso | `CONSTRUIDO Y EJERCITADO` | *Deny-by-default* en `src/proxy.ts` con lista pública de dos entradas. 42 pruebas, ocho ejecutando `proxy()`; cuatro escenarios contra el despliegue el 22-sep-2026. **No verificado:** el tratamiento del prefijo `/helpdesk` dentro del proxy real (§1, salvedad 4) |
| Frontend | `VACÍO A PROPÓSITO` | Retirado el heredado (`1937589`). Cinco rutas —`/`, `/login` y las tres de auth—, sin `AppShell`, sin tokens en `globals.css`, sin tipografía impuesta. `U5` empieza en blanco |
| Identidad de empleados | `EJERCITADA DE PUNTA A PUNTA` | Ingreso real, cierre de sesión, expulsión por desactivación, rechazo por rol ausente, cookie de sesión manipulada sin efecto y destino de retorno saneado — **todo contra el despliegue, 22-sep-2026** (§4). `NOT_REGISTERED` y `EMAIL_INVALID` quedan con cobertura unitaria únicamente |
| Autorización | `NO EXISTE` | Contrato escrito, bloqueado por U0 |
| Ciclo de vida del ticket | `NO EXISTE` | Modelo de datos presente; bloqueado por U0 |
| Sistema de diseño | `NO EXISTE` | Contrato escrito |
| Observabilidad | `NO EXISTE` | Ni alertas, ni reconciliación, ni correlación |
| Documentación | `CERRADA en este corte` | Este conjunto |

## 3. Capacidades publicadas en esta unidad

### U4 — perímetro, retiro de la clave y del frontend heredado (`735be57`, `1937589`)

- **Perímetro *deny-by-default*** (`src/proxy.ts`). Toda ruta es privada salvo las de
  `src/server/security/public-paths.ts`, hoy dos: `/login` y `/api/auth/microsoft`.
  Una página añadida mañana queda protegida sin que su autor haga nada.
- **La regla vive fuera del proxy a propósito.** `public-paths.ts` no depende de Next,
  así que la prueba que enumera `src/app` verifica **la misma función** que el proxy
  aplica, no una copia que pueda divergir. Por el mismo motivo el nombre de la cookie
  se trasladó a `src/server/auth/session-cookie.ts`, sin dependencias: el runtime del
  borde no puede cargar el módulo de sesión, que arrastra Prisma.
- **Dos capas explícitas.** El proxy comprueba **presencia** de cookie —no puede
  alcanzar PostgreSQL, y poner una consulta por petición es la carga permanente que
  descarta la economía de recursos—; `readEmployeeSession` decide la validez.
- **Ingreso sin fricción desde cualquier ruta.** Una navegación de documento sin sesión
  entra por `/api/auth/microsoft/start`, no por `/login`, preservando el destino. Las
  peticiones internas de React (`RSC`) y las que no son navegación van a `/login`, para
  que un prefetch no selle una cookie de estado nueva sobre un ingreso en curso.
- **Redirección del perímetro con `Location` relativo y 303.** Relativo por lo mismo
  que `306d286`; 303 y no 307 para que el POST de una Server Action sin sesión llegue
  al ingreso como GET en vez de producir un 405.
- **Lista exacta de assets públicos** (`public-assets.ts`), no por extensión ni por
  carpeta: sin ella el optimizador de imágenes —que descarga el original con una
  petición interna sin cookies— recibiría una redirección y fallaría en silencio.
- **`REDIRECCION_PASSWORD` eliminada** del código, de su pantalla y del servicio en
  Coolify. Una prueba falla si el nombre reaparece en `src/`.
- **Portal de clientes retirado** entero, con su API y su cookie.
- **Frontend heredado retirado** entero: vistas de redirección, `AppShell`, tablas,
  formulario, `features/tickets/` (código muerto), tokens de `globals.css` y fuentes de
  plantilla del layout. Nada se sustituyó por nada: los valores visuales son `U5`.
- **16 pruebas nuevas** (42 en total): ocho ejecutan `proxy()` sobre peticiones reales;
  las otras enumeran `src/app` y exigen que ninguna ruta quede sin clasificar, que toda
  privada resuelva identidad en su propio archivo, que toda Server Action de `src/` la
  resuelva por su cuenta, y que la clave compartida no reaparezca.

### U3 — identidad de empleados (corte anterior)

Identidad de empleados, **en funcionamiento sobre el despliegue real**, con la primera
persona habilitada y la ruta pública sirviendo tráfico:

- Flujo OIDC/PKCE contra Entra ID con SSO silencioso (`prompt=none`) y reintento
  explícito tras rechazo del proveedor (`src/app/api/auth/microsoft/{start,callback}`).
- Validación completa del `id_token` en el orden exigido por la spec
  (`src/server/auth/entra-oidc.ts`).
- Admisión contra `core.dim_personal` con las cuatro causas de rechazo cerradas
  (`src/server/auth/employee-admission.ts`).
- Sesión propia opaca en `app.employee_session`, con revocación y relectura de admisión
  en cada petición (`src/server/auth/employee-session.ts`).
- Saneo del destino de retorno, sellado AEAD de la cookie de estado OIDC, credencial
  opaca (`src/server/auth/sanitize-destination.ts`, `src/server/security/`).
- Pantalla de login y landing raíz reemplazando el selector portal/redirección
  (`src/app/login/page.tsx`, `src/app/page.tsx`) — sin estilo propio a propósito, el
  contrato de diseño es competencia de `U5`.
- Migración de esquema (`prisma/migrations/20260911150000_agregar_identidad_empleados`),
  **aplicada contra la base real** tras reparar un `GRANT` faltante (§6), y `pnpm test`
  como script nuevo del proyecto (primera suite automatizada del repositorio, 26
  pruebas).
- `basePath: "/helpdesk"` (`next.config.ts`) y la corrección de todos los puntos
  donde Next.js no lo antepone solo: URLs de los route handlers de auth
  (`src/server/auth/base-path.ts`), `path` de las cookies de sesión/estado, `<Link>`
  en vez de `<a>` en `/login`, Server Action en vez de `<form action>` en la landing.
- Redirecciones internas con `Location` relativo (`src/server/auth/app-redirect.ts`,
  `buildAppPath`). Detrás del proxy de Coolify, `request.url` trae el Host del socket
  interno del contenedor (`0.0.0.0:3000`), no el que pidió el navegador. Se descartó
  reconstruir el origen desde `x-forwarded-proto`/`x-forwarded-host`: obliga a validarlos
  contra lista blanca so pena de convertir cada redirección en un *open redirect*,
  mientras que un `Location` relativo lo resuelve el navegador contra su propio origen
  (RFC 7231 §7.1.2). El 307 preserva método y cuerpo, que es lo que necesita el cierre
  de sesión por POST.

## 4. Evidencia disponible

| Tipo | Demuestra | **No** demuestra |
|---|---|---|
| Lectura del árbol de HelpDesk | Qué contiene el código y el SQL hoy | Que funcione, ni qué hace en ejecución |
| Lectura del árbol de Impulsa | Cómo resolvió el proyecto hermano identidad, permisos y diseño | Que esas piezas funcionen aquí sin adaptación |
| `git log` y `git status` | Que el árbol estaba limpio y cuál es el HEAD | Nada sobre despliegues |
| `legacy/baseline-calidad.md` | Que la carga inicial cuadró **en su momento** (fecha no fijada, anterior al 03-sep-2026) | Que siga cuadrando hoy — **ver contradicción abajo** |
| 3 consultas SQL en la VPS (U1 §1, §4, §5) + lectura directa de `n8n/` (U1 §2, §3), ambas **10-sep-2026** | Ver tabla siguiente — las cinco preguntas de U1 | Que la instancia viva de n8n tenga hoy exactamente lo que el archivo exportado describe (nota al pie de esta sección) |
| `prisma generate`/`tsc --noEmit`/`eslint`/`next build` + 26 pruebas unitarias, 15-sep-2026, en local con FNM (Node 24.16.0) | Que el código de U3 tipa, construye y las reglas puras de validación/admisión/saneo se comportan como la spec exige, **con datos de prueba** | Que el flujo funcione contra Entra ID real, ni que la migración aplique limpio contra `core.dim_personal` con sus 167+ filas reales — pruebas contractuales, no E2E |
| Lectura del repositorio real de Conecta (`RBGCT-REACT`, ramas `main` y `stiben`), 15-sep-2026 | Cómo autentica Conecta hoy y qué no ofrece para federar identidad (§ cabecera) | Que `stiben` vaya a desplegarse tal cual, ni el estado de Conecta más allá de este corte |

| **Ejercicio de U3 contra el despliegue real, 22-sep-2026** — navegador sobre `https://conecta.rbgct.cloud/helpdesk` más consultas a `app.employee_session` y `core.dim_personal` | Seis de los ocho escenarios mínimos de `plan-ejecucion.md` §U3, el enlace del sujeto inmutable y la revocación en servidor — tabla siguiente | `NOT_REGISTERED` ni `EMAIL_INVALID` (no reproducibles sin una cuenta del tenant ajena al directorio, o un `id_token` sin correo válido); tampoco la expiración de 8h, que solo se observa dejando pasar el tiempo |

| `tsc --noEmit`/`eslint`/`next build` + 42 pruebas unitarias, 22-sep-2026, en local con FNM (Node 24.16.0) | Que el código de U4 tipa, construye —el build reconoce el proxy— y que `proxy()` clasifica y responde como la spec exige sobre peticiones fabricadas, incluida una ruta inexistente | Que el proxy se comporte igual dentro del despliegue: **ninguna prueba demuestra cómo llega el prefijo `/helpdesk` al pathname en ejecución**, solo que las dos formas se clasifican igual |
| **Ejercicio de U4 contra el despliegue real, 22-sep-2026** — navegador sobre `https://conecta.rbgct.cloud/helpdesk`, más la pantalla de variables de Coolify | Cuatro escenarios, tabla más abajo | Que el 401 de API sin sesión, el paso del asset público o el trato de las peticiones `RSC` se comporten en producción como en la suite — ninguno se tocó a mano |

**U4 — escenarios ejercitados contra el despliegue, 22-sep-2026** (reportados por el
usuario; no hay captura ni log archivado de cada uno):

| Escenario | Evidencia observada |
|---|---|
| Ingreso por la raíz con perímetro activo | `https://conecta.rbgct.cloud/helpdesk` sin sesión lleva al ingreso y termina en la página de HelpDesk con el nombre de la persona |
| Pantallas retiradas, ausentes | `/helpdesk/redireccion/login` y `/helpdesk/portal` ya no sirven la interfaz anterior |
| Destino de retorno tras el perímetro | Una ruta privada pedida sin sesión lleva al ingreso y devuelve a esa ruta, no a la raíz |
| Variable retirada del servicio | `REDIRECCION_PASSWORD` ya no figura entre las variables de entorno en Coolify |

**U3 — escenarios mínimos, contra el despliegue real, 22-sep-2026:**

| Escenario (`plan-ejecucion.md` §U3) | Evidencia observada |
|---|---|
| Ingreso de persona admitida | `/helpdesk/login` → Entra ID → `/helpdesk` con «Sesión activa: DANIEL FELIPE LOPERA ESTRADA» |
| Rechazo `INACTIVE`, con prueba negativa | Con sesión viva, `estado_activo = false` en `dim_personal` → recargar → `/helpdesk/login?error=INACTIVE` |
| Rechazo `UNKNOWN_ROLE`, con prueba negativa | `rol_aplicacion = NULL` manteniendo `estado_activo = true`, para aislarlo del caso anterior → `?error=UNKNOWN_ROLE` |
| Rechazo `NOT_REGISTERED` | **Sin ejercitar** — solo prueba unitaria |
| Rechazo `EMAIL_INVALID` | **Sin ejercitar** — solo prueba unitaria |
| Desactivación con efecto en la siguiente navegación | El mismo caso `INACTIVE`: la expulsión ocurrió al recargar, no en el siguiente ingreso — la relectura de `readEmployeeSession` funciona contra la base real, que es justo lo que ninguna prueba unitaria alcanza |
| Cookie de sesión manipulada | Alterado un carácter de `helpdesk_employee_session` (`HttpOnly`, no editable desde consola): no concedió acceso, se re-autenticó contra Microsoft y se emitió sesión nueva — fila con `issued_at` posterior en `app.employee_session` |
| Destino de retorno preservado y saneado | `destino=/portal` aterriza en `/helpdesk/portal` (preservado); `https://evil.example.com`, `//evil.example.com` y `/\evil.example.com` aterrizan los tres en `/helpdesk` (saneados). Ninguno salió del origen |

**Corroboraciones no planificadas, de la misma tabla de sesiones:** `expires_at −
issued_at` = 8h exactas con `last_seen_at = issued_at` (vida absoluta, sin renovación
deslizante) · filas con `revoked_reason = 'LOGOUT'` (la revocación mata la fila en
servidor, no solo borra la cookie) · `entra_object_id` poblado en `dim_personal` (el
enlace del sujeto inmutable ocurrió de verdad).

**Prueba negativa no planificada:** encadenar dos flujos de ingreso sin terminar el
primero produjo `?error=STATE_MISMATCH` — el estado OIDC es de un solo uso y no se puede
cruzar ni reusar. No estaba en la lista; se registra porque es evidencia real.

**U1 — resultados reales, contra la base de producción, 10-sep-2026:**

| # | Pregunta | Resultado | Lectura |
|---|---|---|---|
| 1 | Personal con correo corporativo activo | **167** filas | Alcance del alta de directorio (`acceso-empleados.md` §7.1) |
| 4 | Estados y prioridades reales de `fact_ticket` | `ABIERTO`/`BAJA`=20, `ABIERTO`/`MEDIA`=26, `CERRADO`/`BAJA`=625, `CERRADO`/`MEDIA`=1885, `CERRADO`/sin prioridad=3. **Cero** `RECHAZADO`. **Cero** prioridad `ALTA` (coherente: no existe en el catálogo) | Total: **2.559** tickets — ver contradicción abajo. Los "3 sin prioridad" sí coinciden con `baseline-calidad.md` |
| 5 | Filas en `ticket_sync_outbox` | **0 filas**, ninguna en ningún estado | Coherente con "Salida PostgreSQL → SharePoint: `CONSTRUIDO, NUNCA EJERCITADO`" (§2) — no hay nada colgado porque nunca corrió nada. Cero filas en el outbox también es evidencia indirecta de que el crecimiento de tickets (ver abajo) no viene del portal: crear desde el portal encolaría salida, y no hay ninguna |

> **`CONTRADICCIÓN`, nombrada y ahora explicada.** `baseline-calidad.md` concilió 2.313
> tickets. La consulta real de hoy cuenta **2.559** — 246 más. **Confirmado por el
> usuario:** la ingesta incremental de SharePoint siguió corriendo desde que se tomó el
> baseline y trajo esos tickets reales adicionales. No es un error de conteo ni un
> baseline mal tomado. `baseline-calidad.md` no se edita retroactivamente (queda como lo
> que confirmó en su momento, con su propia fecha); esta tabla es la cifra vigente.

**F10 — ejecución real de la ingesta corregida, 10-sep-2026, contra `coraje_postgres`/
`coraje` en la VPS de producción, por el usuario:**

| Consulta | Antes de esta unidad | Después de ejecutar la ingesta corregida |
|---|---|---|
| `SELECT COUNT(*) FROM helpdesk.fact_ticket` | 2.559 | **2.825** (+266) |
| Tickets con `id_asignado`/`id_solicitante` apuntando al marcador histórico del buzón compartido | 155 | **165** (+10) |

Confirma tres cosas a la vez: (1) la ingesta corrió de verdad y procesó trabajo nuevo,
no fue un no-op; (2) el fix de F10 no solo resolvió el error de los 155 tickets ya
conocidos — también resolvió correctamente los 10 tickets nuevos que llegaron
referenciando el mismo buzón compartido, sin que nadie tuviera que intervenir caso por
caso; (3) ninguno de los 165 quedó atribuido a la ocupante actual del buzón — la regla
dura se sostiene sobre datos que no existían cuando se diseñó el fix, no solo sobre el
caso conocido de antemano.

**Incidencia real durante la ejecución, resuelta:** el primer intento de correr la
ingesta en n8n repitió el mismo error (`PG - Transform 06 Tickets Legacy`, `ON CONFLICT
... cannot affect row a second time`) porque el usuario había publicado la copia del
workflow **sin** el fix — confusión entre el archivo commiteado
(`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`, con el fix) y una
copia suelta con nombre parecido (`...V2.1...json`, sin commit, sin el fix). Se
descartó en paralelo una segunda hipótesis (que `core.dim_cliente_contai` tuviera el
mismo defecto de correo/identificación duplicada que `dim_personal`): la consulta
`GROUP BY identificacion_fiscal HAVING COUNT(*) > 1` no devolvió ninguna fila. Tras
reimportar el archivo correcto, la ejecución completó sin error.

**Comprobado en entorno real:** las tres consultas SQL de U1, 10-sep-2026, contra
`coraje_postgres`/`coraje` en la VPS de producción. El contenido real de
`n8n/REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json`, leído esa misma
fecha: es el consumidor del outbox, mal nombrado.

**No conocido:** si el despliegue en Coolify está activo más allá de que la base
responda; el comportamiento funcional de PowerApps. **Resuelto en esta unidad:** el
workflow de ingesta activo en la instancia real de n8n hoy es el archivo commiteado
con el fix de F10 — confirmado por ejecución real, no por inspección del export
(`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`, commit `e3b95a1`).

## 5. Fallos abiertos

| # | Fallo | Severidad | Dónde |
|---|---|---|---|
| ~~F1~~ | ~~El portal permite operar a nombre de cualquier cliente sin credencial~~ — **cerrado 22-sep-2026 (U4) por eliminación, no por protección.** Se retiraron las tres páginas, `/api/portal/clientes`, la cookie de cliente y `features/portal/`. Decisión del usuario, con la constancia de que ningún cliente lo usa: la identidad que iba a protegerlo (`U8`) está bloqueada por D2/D3/D4 y no tiene fecha, así que declararlo público en el perímetro habría sido dar por buena la exposición. **Consecuencia que no es cierre: HelpDesk no tiene hoy canal externo de recepción** | ~~Alta~~ | `specs/acceso-clientes.md` §1, §11 |
| ~~F2~~ | ~~La redirección usa contraseña compartida; no hay traza de quién redirigió~~ — **cerrado 22-sep-2026 (U4).** La clave y su pantalla se eliminaron; las vistas pasaron por identidad de empleado antes de retirarse con el frontend heredado. Una prueba de la suite falla si el nombre de la variable reaparece en `src/`, así que la propiedad se mantiene sin vigilancia humana. La traza de quién opera existe desde U3 (`app.employee_session`), pero **queda sin ejercitarse sobre una redirección real**: no hay pantalla que la produzca hasta `U7` | ~~Alta~~ | `specs/acceso-empleados.md` §8 |
| F3 | El ELT sobrescribe todos los campos con SharePoint y pierde la procedencia del portal | **Alta** | `specs/sincronizacion-sharepoint.md` §4.1 |
| ~~F4~~ | ~~Posible duplicado por eco~~ — **cerrado 10-sep-2026**: el workflow sí escribe la referencia legacy antes de marcar `SENT`. Resuelto en diseño; sigue sin ejercitarse con un ticket real | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §4.2 |
| ~~F10~~ | ~~`core.dim_personal` tenía dos filas con el mismo `correo_corporativo`~~ — **cerrado 10-sep-2026, con ejecución real.** `recepcion.gct@rbcol.co` tenía `ccb2a1de...` (activa) y `ef1e69e7...` (fantasma). Esquema aplicado (`es_responsable_historico_no_identificado`, índice único parcial) y la ingesta corrió de punta a punta sin error: 2.559 → 2.825 tickets, 155 → 165 atribuidos al marcador histórico, ninguno a la ocupante actual (§4). El primer intento falló porque n8n tenía publicada la copia sin el fix (confusión de nombres, ver F11) — resuelto reimportando el archivo correcto | ~~Alta~~ | `core.dim_personal`; `specs/tickets.md` §7.3 |
| ~~F11~~ | ~~`sql/elt/06_transform_ticket.sql` y el nodo `PG - Transform 06 Tickets Legacy` de n8n tenían lógica distinta para clasificar `tipo_requerimiento`/`categoria_1`/`categoria_2` legacy~~ — **cerrado 10-sep-2026 (corte 4), decisión del usuario: gana n8n.** Reconciliado: el bloque del repositorio se reemplaza por la lógica de n8n. Hallazgo real, más grave que la descripción original: la versión del repositorio no "cubría menos casos" — no cubría ninguno. Comparaba contra literales en MAYÚSCULAS que `core.norm_text()` (siempre minúsculas) nunca podía igualar, así que el bloque completo caía al `ELSE` en cualquier ejecución sobre ese archivo. La copia de n8n, la única que corre en producción, usa minúsculas y es la que clasificó correctamente los 2.825 tickets ingeridos hasta hoy. Sin cambio de comportamiento en producción — n8n ya tenía la versión correcta | ~~Media~~ | `sql/elt/06_transform_ticket.sql` vs. `n8n/CORAJE - INCREMENTAL COMPLETO...json` |
| ~~F12~~ | ~~El comentario de n8n sobre `codigo_ticket` y un subsistema de identidad sin rastro en el repositorio~~ — **cerrado de verdad, 10-sep-2026 (corte 5).** El primer cierre (corte 4) estaba mal: se apoyó solo en `git log`, nunca en la base real. Investigado a fondo: `codigo_ticket` confirmado como el mecanismo real y correcto (trigger + contador por área/año, con guarda idempotente) — el baseline lo captura tal cual. `identidad_correo`/`resolucion_*` (y, descubierto después, cuatro columnas `*_snapshot` más en `fact_ticket` con la misma data) confirmados como el mismo problema que ya resuelve `sql/elt/04_transform_personal_historico.sql`, abandonados desde jul-2026, sin nada que dim_personal no tuviera ya — retirados de la base real, con lo rescatable en `docs/legacy/identidad-correo-2026-07.md`. Efecto colateral: el backfill de F10 estaba incompleto (solo un correo de varios) — cerrado con un `UPDATE` de 72 filas. `fact_ticket` verificado con exactamente las 18 columnas de `sql/db/06_helpdesk_facts.sql` | ~~Alta~~ | `docs/legacy/identidad-correo-2026-07.md`; consultas de solo lectura contra `coraje_postgres`/`coraje`, 10-sep-2026, columnas/índices/CHECK/triggers/funciones de `core`+`helpdesk`+`staging` completas |
| ~~F5~~ | ~~El workflow de salida no está commiteado~~ — **cerrado 10-sep-2026**: commiteado con nombre correcto (`n8n/CORAJE - SALIDA - PostgreSQL to SharePoint.json`, commit `1de8641`) y **confirmado activo en la instancia viva de n8n** (el usuario lo confirmó al cerrar esta unidad). Sigue sin ejercitarse con un ticket real — el outbox tiene 0 filas (U1 §5), nadie ha radicado desde el portal todavía | ~~Alta~~ | `specs/sincronizacion-sharepoint.md` §2.2 |
| ~~F6~~ | ~~Una sola credencial de base para migrar y para servir~~ — **cerrado 11-sep-2026, más grave de lo descrito: `coraje_app` resultó ser además superusuario y el único rol de aplicación del clúster.** Creados `coraje_migrator` (dueño de `core`+`helpdesk`), `coraje_runtime` (DML, usa `web`) y `coraje_etl` (dueño de `staging`, DML sobre `core`+`helpdesk`, usa n8n); `coraje_app` retirado de todo uso automático, contraseña rotada, queda solo para emergencias humanas. **Corrida real de n8n con `coraje_etl` confirmada de punta a punta** tras corregir dos huecos que el `GRANT` inicial no cubría: `staging` sin transferir a `coraje_etl`, y un `CREATE UNIQUE INDEX` que n8n traía embebido contra `core.dim_cliente_contai` — ya redundante y contrario a D1, retirado del workflow (vivo y committeado). **`coraje_runtime` confirmado con una escritura real** (ticket creado desde el portal, corte 8) | ~~Media~~ | `estado/operacion.md` |
| F7 | `.env.example` declara **una** variable (`DATABASE_URL`) de las ocho que el código lee: las cuatro de Entra (`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`), `HELPDESK_TOKEN_ENCRYPTION_KEY` y las dos del webhook de n8n. Todas puestas en Coolify, ninguna documentada. Un despliegue nuevo arranca y falla en el primer ingreso, no al arrancar. Las dos de n8n solo las lee la acción de redirección, hoy sin pantalla que la invoque | Baja | `estado/operacion.md` |
| F8 | El SLA no se pausa, no se recalcula y no existe prioridad `ALTA` | Media | `specs/tickets.md` §5 |
| F9 | `encargado_interno` es texto libre sin clave foránea | Baja | Ídem §7.2 |

> **F12 reabierto — la consulta que se marcó "opcional, de prioridad baja" en corte 4
> era la que hacía falta correr antes de decidir, no después.** Ya se corrió, contra la
> base real, como parte del arranque de U2 (corte 5). Resultado: el mecanismo de dos
> argumentos existe y está activo, y aparece además un subsistema de identidad
> (`core.identidad_correo` y columnas asociadas de `fact_ticket`) sin rastro en todo el
> repositorio. La decisión de diseño sobre `codigo_ticket` queda sin efecto hasta
> entender ese hallazgo mayor — ver §5, fila F12, y la pregunta de procedencia hecha al
> usuario al cierre de esta entrada.

## 6. Riesgos abiertos

| Riesgo | Impacto | Control inmediato |
|---|---|---|
| Construir el ciclo del ticket sin levantar PowerApps | Rechazo de los empleados al migrar | U0, iniciado ya por su latencia |
| Crear tablas antes de decidir el modelo de esquema | Dos historias de esquema divergentes | U2 bloquea toda unidad que cree tablas |
| El equipo trabaja en la plataforma y la ingesta le borra el trabajo | Pérdida de trabajo real | U9 antes de que U7 esté en uso |
| Un cliente radica y el ticket se duplica en SharePoint | Visible para PowerApps y para el cliente | Reducido, no eliminado: el diseño del workflow ya no duplica (U1 §2, `sincronizacion-sharepoint.md` §4.2), pero sigue sin ejercitarse con un caso real — probarlo con el primer ticket real del portal antes de anunciarlo cerrado |
| La autorización destructiva alcanza datos reales | Pérdida irrecuperable | `contexto-canonico.md` §1.3 delimita el alcance |
| ~~Se retiró el ciclo local antes de que exista el servicio `migrate` gateado que lo reemplaza~~ — **resuelto 11-sep-2026 (corte 8)**: servicio `migrate` desplegado, gate `depends_on: service_completed_successfully` confirmado en un deploy real de Coolify (logs: `No pending migrations to apply.` antes de que `web` arrancara) | ~~Sin el servicio, no había forma documentada de verificar comportamiento — ni local, ni por push~~ | ~~Cerrado~~ |
| ~~La contraseña real de `coraje_app` se pegó en texto plano en esta conversación~~ — **resuelto 11-sep-2026**: rotada al cerrar F6, con `\password` interactivo (no vuelve a aparecer en texto). `coraje_app` además dejó de ser la credencial de cualquier sistema automático | ~~Si el historial de esta sesión quedaba expuesto, exponía con él la credencial de base de producción~~ | ~~Cerrado~~ |
| ~~`n8n/` tiene tres archivos sin commit~~ — **cerrado por completo 10-sep-2026**: el consumidor del outbox quedó renombrado, commiteado (`1de8641`) y confirmado activo; cuál copia de la ingesta es la real quedó confirmado por ejecución (la del archivo commiteado, `e3b95a1`, tras corregir una confusión real donde se publicó primero la copia sin fix); `V2` y `V2.1` quedaron borradas del disco de la VPS y de n8n, confirmado por el usuario | ~~Confusión futura si alguien reactivaba la copia equivocada~~ | ~~Cerrado~~ |
| El workflow de ingesta committeado embebe su propia copia de cada query SQL — **no la lee de `sql/elt/`**. **Materializado, no solo teórico:** el primer intento de correr la ingesta en esta unidad falló porque se publicó una copia de n8n sin el fix; se resolvió reimportando el archivo correcto. Ningún commit, por sí solo, cambia lo que n8n ejecuta — sigue siendo cierto para el próximo fix | Repetir el mismo incidente en la próxima corrección: escribir el fix en `sql/elt/`, olvidar reimportarlo a n8n, y que la instancia viva siga corriendo la versión vieja sin que nada lo avise | Antes de dar por aplicado cualquier cambio a `sql/elt/06_transform_ticket.sql` (o cualquier archivo que un nodo de este workflow embeba), confirmar explícitamente que se reimportó a la instancia viva — no asumir por el nombre o la fecha del archivo local; ver F11 sobre la divergencia de `tipo_legacy` entre ambas copias, que ningún reimport futuro corrige por sí solo |
| ~~La migración de U3 crea `ux_dim_personal_correo_activo`, único parcial sobre `correo_corporativo`~~ — **descartado como causa real (17-sep-2026)**: la consulta de verificación devolvió 0 filas, ningún duplicado. El deploy sí falló, pero por otra razón — ver fila siguiente | ~~El `CREATE UNIQUE INDEX` fallaría al desplegar si hubiera un duplicado~~ | ~~Verificado y descartado~~ |
| ~~**El primer deploy de U3 falló.**~~ — **resuelto 18-sep-2026, con evidencia completa.** `coraje_migrator` (dueño de `core`/`helpdesk` desde F6) nunca recibió el privilegio `CREATE` sobre la base de datos completa — crear un schema nuevo (`app`) lo exige, ser dueño de schemas existentes no alcanza. Error real: `permission denied for database coraje` (SQLSTATE 42501), `applied_steps_count: 0`. Reparado: `GRANT CREATE ON DATABASE coraje TO coraje_migrator` → `prisma migrate resolve --rolled-back` (confirmado por `rolled_back_at` poblado) → redeploy → columnas `rol_aplicacion`/`entra_object_id` confirmadas existentes → `UPDATE` exitoso sobre `daniellopera@rbcol.co` | ~~Bloqueaba por completo el arranque de `web` — el gate de U2 hizo justo lo que debía~~ | ~~Cerrado, con evidencia de cada paso~~ |
| ~~**La regla de enrutamiento que reenvía `/helpdesk/*` al contenedor de HelpDesk no existe todavía**~~ — **cerrado 22-sep-2026:** declarada en Traefik de Coolify, sin *strip prefix* (los assets de Next.js cargan y el preflight de Tailwind se aplica), redirect URI de Entra y `ENTRA_REDIRECT_URI` alineados a `/helpdesk`, y `https://conecta.rbgct.cloud/app` sigue sirviendo el SPA de Conecta — la regla no se comió el dominio. Al ejercitarla apareció un defecto que solo el despliegue podía revelar (`Location` absoluto derivado de `request.url`, que resolvía a `0.0.0.0:3000`), corregido en `306d286`. Texto original: (actualizado 18-sep-2026: el prefijo era `/app/HelpDesk` hasta este corte). `basePath` está construido de este lado (`next.config.ts`), pero sin la regla en Traefik de Coolify no hay tráfico real que llegue, y el redirect URI de Entra apunta además a la ruta anterior | Nadie puede completar un ingreso real hasta que se configure, aunque el App Registration, las variables de Coolify y el rol de la primera persona ya estén listos | Declarar el dominio con path en el recurso `web` de Coolify, verificar que no se aplique *strip prefix*, y alinear el redirect URI de Entra y `ENTRA_REDIRECT_URI` — el Nginx de Conecta no se toca (ver "Acción inmediata") |
| **El perímetro no está verificado en ejecución sobre el punto que más podría fallar.** Ninguna prueba demuestra cómo llega el prefijo `/helpdesk` al pathname dentro del proxy real; lo que hay es una normalización que clasifica igual en los dos casos | Si esa suposición fuera falsa **y** la normalización se retirara o se rompiera, el perímetro clasificaría mal en bloque: o deja pasar todo como público, o deniega todo incluido `/login`. No es un fallo parcial ni ruidoso | No tocar `normalizeAppPathname` sin ejercitar después contra el despliegue. La salida ante un fallo total es `git revert` del commit del perímetro y redesplegar: no hay riesgo para los datos |
| **Aceptado explícitamente por el usuario (corte 9), contra la recomendación dada:** HelpDesk reutiliza el App Registration de Entra ID de Conecta en vez de uno propio | Un incidente administrativo sobre ese App Registration (rotación total de secrets, deshabilitar `ID tokens`, eliminación) tumba **Conecta y HelpDesk a la vez** — ninguno puede aislarse del otro. Los logs de sign-in de Entra quedan mezclados por `client_id`, sin distinguir tráfico de un módulo u otro sin filtrar por redirect URI | Ninguno construido: cada módulo genera su propio `client secret` dentro del App Registration compartido (mitiga la rotación, no el resto). Si el acoplamiento se materializa en un incidente real, es la señal para revisar esta decisión |

## 7. Commits relevantes

| Commit | Cambio |
|---|---|
| `1937589` | **Corte vigente.** Retira el frontend heredado del Coraje anterior: vistas de redirección, `AppShell`, tablas, formulario, `features/tickets/`, tokens de `globals.css` y fuentes del layout. Nada se sustituye: los valores visuales son `U5` |
| `735be57` | **U4.** Perímetro *deny-by-default* (`src/proxy.ts`), retiro de `REDIRECCION_PASSWORD` y del portal de clientes completo |
| `306d286` | Emite las redirecciones internas con `Location` relativo: detrás del proxy, `request.url` resolvía a `0.0.0.0:3000` |
| `cfce427` | Mueve HelpDesk de `/app/HelpDesk` a `/helpdesk` (D7) |
| `5f6aacd` | Cierra la reparación del deploy de U3, con evidencia real de cada paso |
| `e648fcb` | Documenta la resolución de D7 (navegación) y el fallo del deploy |
| `58eb27f` | Construye `basePath` para D7: corrige URLs/cookies que Next.js no antepone solo |
| `b2e7ad0` | Pide `Mail.Send`/`offline_access` desde el primer consentimiento (D6) |
| `10856c8` | Registra U3 en handoff/specs/contexto-canonico, con la decisión de reutilizar el App Registration de Conecta |
| `660fd2b` | Construye OIDC/PKCE, admisión y sesión de empleados (U3); nuevo schema `app`, columnas de identidad en `dim_personal`, `pnpm test` |
| `0f1ced5` | Activa el servicio `migrate` en `docker-compose.yaml` y gatea el arranque de `web` — cierra U2 |
| `08438c2` | Retira el `CREATE INDEX` embebido contra `core` del workflow de n8n, confirmado en vivo |
| `fa1c983` | Agrega la etapa `migrator` al `Dockerfile`, inerte hasta el commit anterior |
| `95c1d8b` | Cierra F6 en la documentación |
| `da951d8` | Documenta la adopción del baseline contra producción |
| `1e4a6a8` | Construye el baseline Prisma: `schema.prisma` (14 modelos `PascalCase`+`@@map`), migración a mano `20260910000000_baseline`, 20 archivos de aplicación migrados a `camelCase` |
| `134663a` | Cierra F10 en la documentación con evidencia de ejecución real |
| `6fb3bd5` | Reemplaza placeholders de conexión por valores reales en los comandos entregados |
| `e3b95a1` | Construye el modelo de buzón compartido para `dim_personal` (F10) |
| `e8918e6` | Actualiza cabecera, commits y acción inmediata del handoff al estado real tras el hallazgo de F10 |
| `e2ffb24` | Retira `create-copilot-export.sh`, sin relación con HelpDesk |
| `d5efa5a` | Documenta consultas SQL directas contra la VPS y el gate de `migrate` |
| `52aed2a` | Versiona `.claude/skills/` |
| `1de8641` | Corrige Proyectos y TI como tipo, no área; añade `codigo_area`; commitea el consumidor del outbox |
| `6a54bde` | Cierre de U0/U1: decisiones de esquema, SLA, permisos ratificados, F10 descubierto |
| `6ae29e1` | Línea base documental completa |
| `a5d8347` | Estabiliza el ETL incremental SharePoint → PostgreSQL |

---

**El corte 3 quedó CERRADO (10-sep-2026).** Los cuatro pasos originales y el residuo de
n8n (consumidor del outbox activo, `V2`/`V2.1` borradas) quedaron confirmados por el
usuario, con evidencia real en cada uno — ver §4 y §5. **El corte 4 (esta unidad)
reconcilia F11** a pedido explícito del usuario, en paralelo a U2 tal como el corte 3 lo
dejó habilitado — no es una desviación de la cabeza de la cola. Al arrancar U2 (corte 5)
apareció F12 reabierto y un hallazgo mayor (subsistema de identidad no documentado,
detalle en §5) que bloqueó el baseline hasta investigarlo a fondo. **Ya resuelto:** F12
cerrado de verdad, F10 cerrado de verdad, la base real retirada de todo lo huérfano y
verificada contra `sql/db/06_helpdesk_facts.sql` columna por columna. F11 sigue cerrado
(§5); D8 sigue diferida, sin fecha asignada (`Decisiones tomadas y NO implementadas`).

**El corte 6 construye el baseline y lo adopta contra producción** (`1e4a6a8` +
`prisma migrate resolve --applied` ejecutado el 11-sep-2026). **El corte 7 cierra F6**
(ver UNIDAD arriba): credenciales separadas en cuatro roles, `coraje_app` retirado de
todo uso automático. De los dos escenarios mínimos que le quedaban a U2 según
`plan-ejecucion.md`, solo falta uno: **construir el servicio `migrate` de un disparo
que gatee el arranque de `web`**, igual que Impulsa — ahora sin ambigüedad sobre qué
credencial usar (`coraje_migrator`). **La acción inmediata es ese servicio**: etapa
`migrator` en el `Dockerfile`, el propio servicio en `docker-compose.yaml` con
`depends_on: condition: service_completed_successfully` sobre `web`, y las variables
nuevas de Coolify (`DATABASE_MIGRATION_URL` con `coraje_migrator`) antes de publicar
el compose — nunca al revés, o el primer deploy con el servicio ya wireado se cae
igual que se explicó al usuario sobre la baseline (ver corte 6).

**El corte 8 construye y despliega ese servicio de verdad — U2 queda cerrada.**
Publicado en dos commits separados por riesgo (`fa1c983` inerte, `0f1ced5` activa el
gate), con `DATABASE_MIGRATION_URL` ya en Coolify antes del segundo push. El deploy
real confirmó en logs lo que el ensayo manual ya había mostrado: `migrate` corre,
dice `No pending migrations to apply.` y termina bien; `web` arranca después. La
última salvedad de F6 (una escritura real con `coraje_runtime`) se cerró en el mismo
paso: el usuario creó un ticket real desde el portal y probó la redirección.
**Siguiente unidad: U3 · Identidad de empleados**, cabeza de `plan-ejecucion.md`.

**El corte 9 construye U3 completa** (OIDC/PKCE, admisión, sesión propia) y la verifica
estáticamente (`prisma generate`, `tsc --noEmit`, `eslint`, `next build`, 26 pruebas
unitarias) — publicado en `660fd2b`. **U3 no cierra en este corte**: nada de esto se ha
ejercitado contra el tenant real ni contra la base real. Antes de que alguien pueda
completar un ingreso de verdad hacen falta, en este orden, los cuatro pendientes que
siguen — los tres primeros son decisiones/datos que solo el usuario puede resolver, el
cuarto es mecánico una vez resueltos los anteriores.

**Corte 10 (17/18-sep-2026): los cuatro pendientes operativos de U3 quedaron
completados por el usuario, con evidencia real, incluida la reparación del primer
deploy fallido.** App Registration de Conecta reutilizado con todos los permisos (§9
de la spec), redirect URI
`https://conecta.rbgct.cloud/app/HelpDesk/api/auth/microsoft/callback` agregado,
client secret generado, cinco variables en Coolify. Verificación de duplicados: **0
filas** — el índice único parcial nunca fue un riesgo real. El primer intento de
deploy **falló** (`permission denied for database coraje`: `coraje_migrator` nunca
tuvo `CREATE` sobre la base, solo era dueño de `core`/`helpdesk` desde F6) — reparado
de punta a punta: `GRANT CREATE ON DATABASE coraje TO coraje_migrator` → `prisma
migrate resolve --rolled-back 20260911150000_agregar_identidad_empleados` (confirmado
por `rolled_back_at` poblado en `_prisma_migrations`) → redeploy → columnas
`rol_aplicacion`/`entra_object_id` confirmadas existentes → `UPDATE` exitoso
(`rol_aplicacion = 'AGENTE'` para `daniellopera@rbcol.co`, la primera persona
habilitada). **Todo lo de identidad está construido, desplegado y con al menos una
persona lista para ejercitarlo.**

**En esta misma sesión se resolvió D7 (navegación/URL):** HelpDesk cuelga de
`/helpdesk` bajo el dominio de Conecta, conservando su sidebar/topbar. Construido:
`basePath` en `next.config.ts`, y la corrección de todas las URLs/cookies que ese
prefijo afecta (`src/server/auth/base-path.ts`, route handlers de auth, `login/page.tsx`,
landing raíz) — commit `58eb27f`. **No construido, y es la única pieza que sigue
bloqueando el primer ingreso real:** la regla de proxy en Conecta (Traefik de Coolify
o su Nginx interno) que reenvíe `/helpdesk/*` al contenedor de HelpDesk. Sin ella,
aunque el deploy de HelpDesk funcione y la persona tenga rol asignado, esa ruta no le
llega ningún tráfico.

## Acción inmediata para la siguiente sesión — U5, contrato de diseño ejecutable y primera vista

**U4 queda cerrada. La cabeza de `plan-ejecucion.md` pasa a ser U5**, sin desviación.

**Objetivo (`plan-ejecucion.md` §U5):** fundamentos, tema, validador de coherencia entre
los dos adaptadores, y la primera vista nueva construida consumiendo el contrato desde
el inicio.

**Criterio de cierre, tal como el plan lo define:** la vista no contiene un solo valor
visual local, y el validador falla si los dos adaptadores divergen.

**El punto de partida cambió, y a favor.** No hay frontend que desmontar ni con el que
convivir: `globals.css` no declara un solo valor, el layout raíz no impone tipografía,
y `/` y `/login` se dibujan sin estilo. Es la condición que
`design/sistema-helpdesk.md` §1 daba por necesaria al descartar una fase de
centralización posterior. La contrapartida es que **la aplicación no hace nada
visible**: entrar es todo lo que se puede hacer.

**Lo que hay que inspeccionar antes de escribir, no después:** `src/design-system/` de
Impulsa —fundamentos, tema, recetas, componentes, patrones— y sus vistas `/clientes` y
`/clientes/[clienteId]`. Sus archivos llevan comentarios que explican por qué cada
decisión es como es, incluida la razón por la que la alternativa obvia falla. La carga
de la prueba es de quien se aparte de cómo lo resuelven esas vistas.

**D5 quedó resuelta el 23-sep-2026, así que U5 arranca sin decisión pendiente de
usuario: HelpDesk lleva acento visual propio.** Lo que sigue abierto es cuál, y eso es
trabajo de la unidad, no consulta: dentro de la paleta corporativa, sin chocar con el
navy sobre el que se apoya el shell de Conecta, y sin competir con la señal de urgencia
de la bandeja — en una mesa de ayuda esa señal es información, no adorno
(`design/sistema-helpdesk.md` §2, §5).

**Lo que U5 arrastra además, y conviene no descubrir a mitad:** replicar el shell de
Conecta dentro de HelpDesk (sidebar y topbar) es parte de esta unidad, no de otra — la
composición en tiempo de request se descartó con evidencia en el corte 11, porque la
interfaz de Conecta es un SPA sin layout de servidor. Y `public/rb-logo.png` es hoy el
único asset del proyecto: lo dejó en pie el perímetro, con una entrada en la lista
exacta de `public-assets.ts`, precisamente porque la pantalla de acceso va a necesitarlo
sin sesión en cuanto tenga estilo.

### Lo que NO hace falta repetir

Configuración cerrada y verificada, no volver a tocarla: App Registration compartido con
Conecta (permisos, `client secret` propio de HelpDesk, redirect URI en `/helpdesk`), las
cinco variables en Coolify, la clave de sellado, `daniellopera@rbcol.co` con
`rol_aplicacion = 'AGENTE'`, la migración de U3 aplicada contra la base real, y la regla
de enrutamiento en Traefik sin *strip prefix*.

**Estado de la fila de prueba al cerrar este corte:** `daniellopera@rbcol.co` quedó
restaurada a `estado_activo = true` y `rol_aplicacion = 'AGENTE'`. Todos los `UPDATE` de
los escenarios negativos fueron revertidos. **Si alguien repite esas pruebas, el comando
de restauración debe fijar las dos columnas a la vez**: durante este corte se perdió el
acceso dos veces por revertir solo una, y no hay una segunda cuenta con rol que pueda
entrar a arreglarlo desde la aplicación — la salida es siempre por `psql`.

### Lo que queda del lado de Conecta, y ahora sí entra en alcance

El SPA de Conecta no tiene hoy ningún enlace a HelpDesk. Cuando `U5` lo añada al
sidebar, **debe ser un enlace de navegación real (`<a href>`), nunca `navigate()` de su
router**: una navegación de cliente la resuelve React Router dentro de Conecta, que no
conoce la ruta y redirige a su raíz. Es el único cambio que D7 exige en el repositorio
de Conecta.

### Higiene registrada, sin acción asignada

- `coolify-proxy` puede tomar la IP de `web` en `coolify` o en `coraje_net` — elección no
  determinista, no defecto. Fijarla con la label `traefik.docker.network=coolify` es
  razonable, pero conviene mirar antes las labels que Coolify genera por su cuenta.
- Mientras `coolify-proxy` siga unido a `coraje_net` —se hizo para alcanzar a n8n—, el
  contenedor de Traefik alcanza directamente a `coraje_postgres`. La solución de raíz es
  unir n8n a la red `coolify` y sacar el proxy de `coraje_net`; fuera del alcance de U3
  y de U4.
- Manipular la cookie de sesión deja la sesión anterior **viva y sin revocar** hasta su
  expiración (8h). Nadie conserva ya ese token —el navegador lo sobrescribió— y no
  contradice la spec, pero es un residuo real observado en `app.employee_session`.

> **F11 (descubierto en el corte 3): cerrado en el corte 4.** La lógica de clasificación
> de `tipo_requerimiento` legacy divergía entre `sql/elt/06_transform_ticket.sql` y la
> copia embebida en n8n. Reconciliado con la lógica de n8n, por decisión del usuario —
> ver §5 para el detalle completo, incluido el hallazgo de que la versión del
> repositorio no funcionaba en absoluto (bug de mayúsculas contra `core.norm_text()`).

> **En paralelo, y no después: U0**, el levantamiento funcional de PowerApps. Su cuello
> de botella es la disponibilidad de otras personas, no el trabajo, así que empezarlo
> tarde retrasa todo lo demás. Es la única excepción declarada a la regla de una sola
> unidad a la vez.

---

## Decisiones tomadas y NO implementadas

| Decisión | Dónde | Estado |
|---|---|---|
| Ningún token viaja entre Conecta y HelpDesk; cada módulo hace su propio OIDC | `specs/acceso-empleados.md` §2 | **Construida (U3, corte 9):** `src/server/auth/entra-oidc.ts`; confirmada además con evidencia real de que Conecta no ofrece ningún mecanismo de federación, no solo por principio |
| SSO silencioso con `prompt=none` para eliminar la fricción del botón | Ídem §4 | **Construida (U3, corte 9):** `/api/auth/microsoft/start`, con cookie anti-bucle de un solo uso. Sin ejercitar contra el tenant real |
| El acceso de clientes se ancla al cliente, no al ticket | `specs/acceso-clientes.md` §3 | Decidida, no construida |
| Estado del ticket derivado de eventos, con escritor único | `specs/tickets.md` §3 | Decidida, no construida |
| Rediseño visual completo, sin fase de centralización posterior | `design/sistema-helpdesk.md` §1 | Decidida, no construida |
| Tipografía Lato, con pesos reales 400/500/600/700 | Ídem §2 | Decidida, no construida |
| D5: acento visual propio de HelpDesk, distinto del teal de Impulsa | Ídem §2 | **Decidida el 23-sep-2026**, no construida. Fija que el acento es propio, no cuál: la elección concreta es de `U5`, acotada por la paleta corporativa, el navy del shell de Conecta y la señal de urgencia de la bandeja |
| HelpDesk se lee como parte de Conecta: su sidebar, su URL, sin enlace de vuelta | `contexto-canonico.md` §1.1 | Decidida, no construida |
| Economía de recursos de la VPS como criterio permanente de diseño | Ídem §1.2 | Decidida, sin línea base medida |
| Modelo de esquema: migraciones Prisma completas, se abandona SQL a mano (D1) | `contexto-canonico.md` §4 | **Construida por completo (corte 8):** baseline adoptado, y el servicio `migrate` ya automatiza cada deploy futuro |
| Consulta de tickets se acota por permiso, no queda sin restricción como en el legacy | `legacy/reglas-negocio-powerapps.md` §13.6 | Decidida, no construida |
| Se retira del runbook el ciclo de desarrollo local; la verificación funcional es siempre vía commit + push a lo desplegado | `estado/operacion.md` | **Construida (corte 8):** el servicio `migrate` que la sostenía ya existe y quedó confirmado en un deploy real |
| Convención de nombres del modelo Prisma: `PascalCase` con `@@map` a `snake_case`, igual que Impulsa (D1') | `contexto-canonico.md` §4 | **Construida (corte 6):** las 14 tablas de `core`+`helpdesk` mapeadas en `schema.prisma`; `staging` queda deliberadamente fuera de Prisma (es dominio del ELT) |
| Observadores (watchers de solo lectura) van en v1, a partir del prototipo `helpdesk_santi/` | `specs/tickets.md` §11, `specs/permisos.md` §10 | Decidida, no construida — depende del catálogo de personas/roles todavía `ABIERTO` |
| Solicitud de validación dirigida a persona va en v1, distinta de la autorización excepcional | Ídem | Decidida, no construida — sin decidir aún si bloquea el avance del ticket |
| D8: `sql/elt/*.sql` sigue existiendo como texto de referencia legible, sin que n8n lo lea — no se construye ahora un mecanismo para que n8n consuma el archivo del repositorio (p. ej. leerlo de GitHub) en vez de su copia embebida | `docs/estado/handoff.md` §5 (F11, F12), §6 (riesgo de divergencia) | **Diferida deliberadamente (10-sep-2026):** no vale la pena esa robustez con nada más construido todavía (sin auth, sin ciclo de vida del ticket). Mitigación mientras tanto: disciplina de proceso, no de infraestructura — confirmar explícitamente el reimport a n8n en cada cambio a un archivo que un nodo embeba (regla ya en §6). Condición de revisión: si la divergencia entre `sql/elt/` y n8n se repite una tercera vez, o al llegar al final de la cola de `plan-ejecucion.md` |
| U0 pregunta 1 (¿espera al cliente?): sí hace falta un estado, generalizado a `ESPERANDO_SOLICITANTE`; el SLA se **reinicia completo** al salir, no se pausa — riesgo aceptado explícitamente | `specs/tickets.md` §4, §5 | Decidida, no construida |
| U0 pregunta 4: la excepción de `alexbolanos@rbcol.co` para `PROYECTOS Y TI` sigue vigente | `legacy/reglas-negocio-powerapps.md` §5, §13.5 | Confirmada por el usuario. Ya decidido normalizarla como fila de tabla, no como código quemado |
| U0 pregunta 2: Jimena Tejeiro no tiene nada especial en su rol frente a Legal — es exactamente el mismo caso que Alex para Proyectos y TI, la responsable normal del área. Quitando la pantalla fusionada (interfaz, no se replica) y el puente a `TareasLegal` (aplazado), no queda ninguna regla de negocio distinta que conservar | `legacy/reglas-negocio-powerapps.md` §11 | Cerrada. Legal se enruta igual que cualquier otra área en la tabla de enrutamiento, sin comparación de identidad en el código |
| U0 pregunta 5: no requiere ningún mecanismo de producto. Reportar y cerrar con las acciones realizadas es responsabilidad de quien resuelve o de quien radicó, no algo que la aplicación pueda detectar | — | Cerrada, sin acción de diseño |
| Modelo de buzón compartido (F10): columna `es_responsable_historico_no_identificado` en `core.dim_personal` (no rango de fechas — sin evidencia de cuándo cambió de manos el buzón), resuelto por `LEFT JOIN LATERAL` con prioridad a la fila histórica. **Bajo ninguna circunstancia** los 155 (hoy 165) tickets históricos quedan a nombre de Eilyn (la ocupante actual) | `specs/tickets.md` §7.3 | **Construida y ejercitada contra la base real** (10-sep-2026): ingesta corrida de punta a punta sin error, 155 → 165 tickets confirmados en el marcador histórico |
| D6: HelpDesk enviará correo al cliente desde la cuenta de quien responde el ticket; `Mail.Send`/`offline_access` se piden desde el primer consentimiento para no exigir una segunda ronda por empleado | `specs/acceso-empleados.md` §9 | **Consentimiento construido (corte 9, 17-sep-2026):** `entra-oidc.ts` ya los incluye en el `scope`. **El mecanismo de envío no** — falta el *grant* delegado cifrado (equivalente a `graph-grant.ts` de Impulsa), sin fecha, probablemente junto a `U7`. `Mail.Send.Shared` (buzón compartido de la firma) sigue sin decidir |

## Decisiones que faltan y bloquean

| # | Decisión | Bloquea | Quién decide |
|---|---|---|---|
| D2 | Qué ve un contacto: sus tickets o los de su empresa | El modelo de acceso externo | Usuario |
| D3 | Si el acceso de cliente vence o solo se revoca | Ídem | Usuario |
| D4 | Por dónde sale el correo del portal | Invitaciones y OTP | Usuario |
| ~~D5~~ | **Cerrada el 23-sep-2026: acento visual propio**, no el de Impulsa. Fija que el tema declara un acento distinto del teal; **no fija cuál** — esa elección es de `U5`, dentro de la paleta corporativa, sin chocar con el navy del shell de Conecta y sin competir con la señal de urgencia de la bandeja | — | — |
| ~~D7~~ | **Cerrada por completo el 22-sep-2026.** Decidida el 18-sep, y **configurada y ejercitada** en este corte: `/helpdesk` sirve tráfico real y el ingreso funciona de punta a punta | — | — |

> **D7 cerrada en sus tres preguntas** (`contexto-canonico.md` §1.1). La ruta es
> `/helpdesk`, prefijo de primer nivel y en minúsculas. El sidebar/topbar **se replican
> dentro de HelpDesk** (`U5`): la composición en tiempo de request se descartó con
> evidencia, porque la interfaz de Conecta es un SPA sin layout de servidor. Y la red
> Docker dejó de ser una incógnita: `coolify-proxy` ya alcanza al contenedor `web` por
> `coolify` y por `coraje_net`, así que no hace falta ninguna red nueva. Lo que queda es
> declarar el dominio con path en Coolify y actualizar el redirect URI — configuración,
> no diseño.


- **U3 agrega la primera suite de pruebas automatizadas del repositorio** (26 unitarias,
  `pnpm test`) — cubre las cuatro causas de rechazo de admisión con prueba negativa y el
  orden de validación del `id_token`, tal como exigía el criterio de cierre. Lo que
  sigue sin cubrir: cualquier escenario que necesite Postgres real (bind del sujeto,
  expiración de sesión con datos reales) — sin ciclo local, eso se ejercita contra la
  base desplegada, no en esta suite.
- **El ELT está bien escrito para lo que se escribió.** Su precedencia incondicional
  hacia SharePoint es correcta en una migración one-way; se convierte en defecto solo
  cuando la plataforma pasa a ser interfaz de trabajo. Es ausencia de una decisión, no
  un error.
- **La carpeta se sigue llamando `coraje-web/`.** Renombrarla tocaría `Dockerfile`,
  compose y despliegue sin ganar nada hoy. Declarado, no pendiente.

---

## 8. Procedimiento de actualización (durable)

Al cerrar cada unidad de trabajo, reemplazar la instantánea conservando esta estructura:

1. **Cabecera** — corte, HEAD, rama, unidad, cambios locales no incluidos.
2. **§1 Veredicto** — qué está cerrado, qué no, y las salvedades sobre lo aparentemente
   cerrado.
3. **§2 Estado por fase** — actualizar solo las filas que cambiaron, **con evidencia**.
4. **§3 Capacidades** — añadir lo publicado en esta unidad.
5. **§4 Evidencia** — qué se demostró y **contra qué HEAD**. Nunca extrapolar entre
   cortes ni de un entorno a otro.
6. **§5–6 Fallos y riesgos** — retirar los cerrados **con evidencia**, añadir los nuevos.
   Los retirados se tachan con su fecha y su razón; no se borran.
7. **§7 Commits** — añadir el commit de la unidad.
8. **Acción inmediata** — **una sola**. Debe ser la cabeza de la cola de
   `estado/plan-ejecucion.md`, o declarar explícitamente que se desvía y por qué.

**Registro de cierre de la unidad:** estado previo · cambio · evidencia · incidencias y
resolución · decisión (cerrada / parcial / revertida / diferida) · commit · documentación
actualizada.

**Vocabulario de estado.** No es binario y no se colapsa: `construido` (typecheck, lint,
build, pruebas) ≠ `publicado` (commit en `origin/main`) ≠ `desplegado` ≠ `ejercitado`
(alguien lo ejecutó contra base o navegador). Las coletillas `SIN EJERCITAR`,
`SIN DESPLEGAR` y `SIN COMMIT` son parte del estado, no adorno.

**Changelog:**
- 03-sep-2026 — línea base del handoff. Primer corte: conjunto documental completo
  escrito y evidencia legacy reubicada, sin una línea de código tocada y sin publicar.
- 03-sep-2026 (mismo día) — se registran tres decisiones de usuario: D1 (migraciones
  Prisma completas, se abandona SQL a mano), retiro del ciclo local del runbook, y
  acotar `Consulta` por permiso. Se abre D1' (convención de nombres del modelo Prisma,
  sin resolver) y un riesgo nuevo: la retirada del ciclo local antecede a que exista el
  servicio `migrate` que la sostiene. Sigue sin haber una sola línea de código tocada.
- 03-sep-2026 (mismo día) — D1' resuelta: `PascalCase` con `@@map` a `snake_case`,
  igual que Impulsa. Confirmado el orden de implementación (U1+U0 antes que cualquier
  construcción); prioridad declarada para cuando U2 empiece: el servicio `migrate`.
- 03-sep-2026 (mismo día) — a partir del prototipo `helpdesk_santi/` (concepto, no
  visual): se confirman Observadores y Solicitud de validación para v1
  (`specs/tickets.md` §11, `specs/permisos.md` §10 y §3). U1 sigue bloqueado por falta
  de acceso a Docker/VPS desde esta sesión; las cinco preguntas de U0 quedan
  pendientes, sin delegar, respondidas con el tiempo.
- 03-sep-2026 (mismo día) — se cierran cuatro de cinco preguntas de U0: nuevo estado
  `ESPERANDO_SOLICITANTE` con SLA de reinicio completo (riesgo aceptado), Alex y Jimena
  confirmados sin rol adicional, pregunta 5 cerrada sin acción de diseño. `permisos.md`
  §6 pasa de `ABIERTO` a `RATIFICADO (parcial)`. Pregunta 3 sigue aplazada por decisión
  previa. U1 sigue sin ejecutarse: sin Docker ni acceso a la VPS desde esta sesión.
- 10-sep-2026 — las tres consultas SQL de U1 se ejecutan contra la VPS real (root, vía
  `docker exec`), fuera de esta sesión. Resultados registrados en §4. Se nombra una
  contradicción sin resolver: el conteo real de tickets (2.559) no coincide con el
  baseline conciliado (2.313, `legacy/baseline-calidad.md`). Quedan sin responder las
  dos preguntas de n8n — U1 sigue sin cerrar. Sigue sin publicarse ni un commit de todo
  lo acumulado desde el 03-sep-2026.
- 10-sep-2026 (mismo día) — **U1 cierra.** El usuario confirma la causa del conteo
  (ingesta incremental sigue corriendo). Lectura directa de `n8n/` revuelve que el
  consumidor del outbox **sí existe**, mal nombrado como
  `REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json` y sin commit, y que su
  código **sí escribe la referencia legacy** antes de marcar `SENT` — F4 cerrado en
  diseño. Confirmado cron de respaldo (12h + requeue) y ausencia de workflow de error.
  Se descubren dos copias inactivas y sin commit de la ingesta (`V2`, `V2.1`), cada una
  con `id` de workflow propio. Nueva acción inmediata: publicar el corte, renombrar y
  commitear el consumidor, y confirmar en n8n cuál ingesta sigue activa antes de U2.
  Sigue sin publicarse un solo commit desde el 03-sep-2026.
- 10-sep-2026 (mismo día) — **corte 2, publicado (`e2ffb24`).** Ejecutando V2.1
  manualmente aparece `ON CONFLICT ... cannot affect row a second time`: diagnosticado
  hasta la causa exacta, `core.dim_personal` duplicado por correo compartido
  (`recepcion.gct@rbcol.co`), 155 tickets reales afectados. El usuario decide la
  dirección (modelo de buzón compartido, nunca atribuir a la ocupante actual) y elige
  V2.1 como versión a mantener — que corrige Proyectos y TI como tipo, no área, y exige
  `codigo_area` nueva en `core.dim_area`. Se commitea y publica todo: la corrección de
  ingesta, el consumidor del outbox renombrado, `.claude/skills/`, la documentación del
  patrón de consulta SQL directa, y el retiro de `create-copilot-export.sh`. **Ninguna
  de las dos correcciones (`codigo_area`, buzón compartido) se aplicó todavía contra la
  base real** — siguen solo en el código. Nueva acción inmediata en consecuencia.
- 10-sep-2026 (mismo día, corte 3) — se construye el diseño de F10: columna
  `es_responsable_historico_no_identificado` en `core.dim_personal`, `LEFT JOIN LATERAL`
  con prioridad a la fila histórica en `06_transform_ticket.sql`, índice único parcial,
  validación que aborta ante ambigüedad sin marcador (`specs/tickets.md` §7.3, detalle
  del diseño). Durante la sesión se intentó `ssh`/`docker exec` directo a la VPS para
  verificar conectividad; el usuario lo detuvo y pidió que quedara como regla dura
  documentada (`operacion.md`) — ninguna sesión vuelve a intentarlo, todo comando de
  producción se entrega como texto. Se descubre F11: la copia de `06_transform_ticket`
  embebida en el workflow de n8n tiene una lógica de clasificación de tipo_requerimiento
  distinta (más completa) que el archivo `sql/elt/` del repositorio — el workflow no lee
  los `.sql` del repositorio, trae su propia copia de cada query. El fix de F10 se aplicó
  a ambas copias (repositorio y JSON de n8n) preservando la lógica más completa de n8n,
  sin reconciliar F11 (fuera de alcance de esta unidad). **Nada de esto se ejecutó contra
  la VPS ni se reimportó a la instancia viva de n8n** — la acción inmediata trae los
  comandos exactos, listos para que el usuario los corra manualmente.
- 10-sep-2026 (mismo día, misma unidad) — a pedido del usuario, se reemplazan los
  placeholders `$POSTGRES_USER`/`$POSTGRES_DB` de los comandos por los valores reales
  (`coraje_app`, `coraje`) — un comando "listo para copiar" no debe exigir resolver una
  variable primero. Commit `6fb3bd5`.
- 10-sep-2026 (mismo día, misma unidad) — **F10 cerrado con ejecución real.** El usuario
  corre los comandos: `codigo_area` ya existía en la base viva (contradicción nombrada,
  no bloqueante); el modelo de buzón compartido se aplicó limpio (dos filas esperadas
  confirmadas, `UPDATE 1` exacto, índice creado sin violación, 0 filas ambiguas). El
  primer intento de ejecutar la ingesta en n8n repitió el error original porque se
  había publicado la copia sin el fix (`...V2.1...json`, sin commit) por confusión con
  el archivo commiteado — diagnosticado ofreciendo dos hipótesis en paralelo (archivo
  equivocado; `dim_cliente_contai` con el mismo defecto que `dim_personal`), la segunda
  descartada por consulta real (0 filas). Tras reimportar el archivo correcto
  (`e3b95a1`), la ingesta corrió de punta a punta: 2.559 → 2.825 tickets, 155 → 165
  atribuidos al marcador histórico del buzón compartido, ninguno a la ocupante actual —
  la regla dura se sostiene sobre datos nuevos, no solo sobre el caso ya conocido.
  Queda un residuo acotado (confirmar consumidor del outbox, borrar `V2`/`V2.1`) y F11
  sigue abierto, deliberadamente sin resolver en esta unidad.
- 10-sep-2026 (mismo día, cierre de la unidad) — el usuario confirma el residuo: el
  consumidor del outbox está activo en n8n, y `V2`/`V2.1` quedaron borradas del
  servidor y de n8n. **Unidad cerrada.** Declara explícitamente que U2 (baseline de
  migraciones Prisma) es la siguiente, en una sesión nueva — no una continuación
  inmediata. F11 queda registrado, abierto, sin fecha asignada.
- 10-sep-2026 (corte 4, sesión nueva) — el usuario abre la sesión declarando ir con U2
  pero resuelve primero F11, en paralelo, tal como el corte 3 lo dejó habilitado:
  decide que gana la lógica de n8n. Al reconciliar aparece que la versión del
  repositorio no era una cobertura parcial del mismo problema — era código muerto por
  un bug de mayúsculas contra `core.norm_text()` (siempre minúsculas), así que nunca
  reclasificó un solo ticket legacy si alguna vez se hubiera ejecutado en vez de la
  copia de n8n. Se reconcilia `sql/elt/06_transform_ticket.sql` con la lógica de n8n,
  sin tocar la copia de n8n (ya correcta) ni la base real. Aparece un segundo hallazgo,
  sin resolver (F12): el comentario de n8n sobre generación de `codigo_ticket` describe
  un trigger y una función de dos argumentos que no existen en `sql/db/`. El usuario
  también pregunta si vale la pena seguir manteniendo `sql/elt/*.sql` dado que n8n no
  lo lee — queda registrado como D8, sin resolver. Cambios sin commit al cierre de esta
  entrada.
- 10-sep-2026 (corte 4, misma sesión) — se investiga F12 por lectura de código:
  `git log -p` sobre `sql/db/02_functions.sql` muestra que `next_codigo_ticket()` nunca
  tuvo, en ningún commit, una versión de dos argumentos, y no existe ningún
  `CREATE TRIGGER` en `sql/`. La hipótesis más probable pasa a ser documentación
  obsoleta de n8n, no drift de esquema — pendiente de confirmar con una consulta de
  solo lectura contra la base real (comando en §5). Aparece un hallazgo colateral real:
  `next_codigo_ticket()` usa la fecha del servidor, no `fecha_creacion` del ticket, así
  que todo ticket legacy migrado quedó con el año de su corrida de ingesta en vez de su
  año histórico — probablemente el motivo real detrás del comentario de n8n. El usuario
  decide diferir D8 (que n8n lea `sql/elt/` de GitHub en vez de embeber su copia):
  no vale la pena esa robustez con nada más construido todavía; la mitigación mientras
  tanto es la disciplina de reimport manual ya documentada en §6. D8 se mueve a
  `Decisiones tomadas y NO implementadas` como diferida, con condición explícita de
  revisión. Se publican dos commits (`e14e0c6` fix de F11, `83ecc54` cierre documental
  de F11/F12/D8) y se hace push a `origin/main`.
- 10-sep-2026 (corte 4, misma sesión, tras el push) — el usuario ratifica el formato
  simple de `codigo_ticket` como el correcto. F12 pasa de "investigado, pendiente de
  verificación" a **cerrado con decisión de diseño**: la alternativa por área queda
  descartada, no solo diferida, porque tenía un defecto propio (inestabilidad ante
  reasignación de área) además de no resolver de raíz que la secuencia ya no se
  reinicia por año. La consulta de solo lectura contra la base real queda como residuo
  opcional, sin bloquear el cierre. Cambios sin commit al cierre de esta entrada.
- 10-sep-2026 (corte 5, sesión nueva) — el usuario pide arrancar U2 sin más demora. Antes
  de escribir el baseline, se pide la consulta de solo lectura contra la base real que
  corte 4 había dejado como "residuo opcional" (columnas de `dim_area`/`dim_personal`,
  todos los índices, todos los CHECK, todos los triggers y todas las tablas de `core`,
  `helpdesk` y `staging`). El resultado retracta el cierre de F12: `next_codigo_ticket`
  sí tiene dos argumentos y hay un trigger activo (`trg_set_codigo_ticket`) — el
  mecanismo que se declaró "nunca construido" corre en producción. Peor: la misma
  consulta revela `core.identidad_correo`, columnas nuevas en `fact_ticket`
  (`id_identidad_correo_asignado/solicitante`, `resolucion_asignado/solicitante`), un
  `chk_fact_ticket_origen_exclusivo` reescrito, un `chk_fact_ticket_evento_tipo` más
  angosto y ninguno de los índices de `fact_ticket` que declara el repositorio —
  reemplazados por otros dos. Se busca en todo el repositorio, incluido `n8n/`: no hay
  ni un rastro. U2 se bloquea por completo hasta que el usuario explique la procedencia
  de ese subsistema. Cambios sin commit al cierre de esta entrada.
- 10-sep-2026 (corte 5, mismo día, cierre) — el usuario admite no recordar el origen y
  pide investigarlo con datos en vez de memoria. El cruce de `resolucion_asignado`
  contra el marcador de F10 confirma que `LEGACY_INFERRED_PERSON` es el mismo problema
  que resuelve `sql/elt/04_transform_personal_historico.sql`, no un mecanismo distinto
  — y revela que el backfill de F10 (corte 3) solo había marcado un correo de varios
  con el mismo patrón; se cierra con un `UPDATE` de 72 filas. El usuario decide: F10 se
  queda, `identidad_correo` se retira, con lo rescatable (9 buzones funcionales
  clasificados a mano, tres ideas para el futuro) preservado en
  `docs/legacy/identidad-correo-2026-07.md` antes de borrar. La verificación del primer
  retiro destapa un segundo grupo de columnas huérfanas en `fact_ticket`
  (`*_snapshot`, `fecha_redireccion`) que ninguna inspección anterior había visto — se
  retiran en la misma pasada. `fact_ticket` queda verificado con exactamente las 18
  columnas de `sql/db/06_helpdesk_facts.sql`. **F10 y F12 cerrados de verdad. La acción
  inmediata vuelve a ser U2: escribir `schema.prisma` y la migración baseline**, ahora
  sobre un esquema completamente inventariado. Cambios de esta entrada sin commit al
  cierre.
- 11-sep-2026 (corte 6) — se escribe `schema.prisma` (14 modelos) y la migración a mano
  `20260910000000_baseline/migration.sql` sobre el esquema ya inventariado; se
  descubre y corrige la cascada de 20 archivos de aplicación que llamaban a Prisma en
  `snake_case`. Verificado en local por primera vez en el proyecto: FNM ya tenía Node
  24.16.0 instalado (solo faltaba activarlo), `corepack` fija pnpm 11.2.2, y
  `prisma generate`/`tsc --noEmit`/`eslint .`/`pnpm build`/`git diff --check` quedan
  limpios. Publicado en `1e4a6a8`. El usuario corrige una suposición de secuencia:
  construir el servicio `migrate` **antes** de adoptar la baseline habría roto el
  siguiente deploy — `migrate deploy` habría intentado ejecutar el DDL de la baseline
  contra tablas que ya existen (`CREATE TABLE` sin `IF NOT EXISTS`, fallo inmediato,
  `web` nunca arranca por el `depends_on: service_completed_successfully`). Se
  ejecuta primero, manualmente, el flujo oficial de Prisma para adoptar una base
  preexistente: el usuario construye solo la etapa `builder` del `Dockerfile` de
  producción en una carpeta aparte en la VPS (`docker build --target builder`) y
  corre `prisma migrate resolve --applied 20260910000000_baseline` en un contenedor
  efímero de esa imagen, unido a `coraje_net`, contra `coraje_postgres` real —
  confirmado en `_prisma_migrations` con `applied_steps_count = 0` (no ejecutó DDL,
  exactamente lo esperado de una adopción de baseline). **Incidencia real: la
  contraseña de `coraje_app` quedó pegada en texto plano en el chat** al copiar el
  comando `docker run` desde la terminal SSH — registrada como riesgo nuevo en §6,
  con recomendación de rotarla junto con F6 en vez de aparte. U2 queda con dos
  escenarios mínimos pendientes: separar credenciales (F6) y construir el servicio
  `migrate`. Nueva acción inmediata: F6 primero (bloquea el diseño del servicio
  `migrate`, que depende de qué credenciales existan).
- 11-sep-2026 (corte 7) — **F6 cerrado.** La verificación previa a escribir el `GRANT`
  (mismo hábito que corrigió F12) revela que `coraje_app` es superusuario y el único
  rol de aplicación del clúster — el usuario decide ampliar F6 para retirarlo también
  de n8n, no solo de la app. Se crean `coraje_migrator` (dueño de `core`+`helpdesk`),
  `coraje_runtime` (DML, `web`) y `coraje_etl` (DML sobre `staging`+`core`+`helpdesk`,
  n8n), verificados contra `pg_class`/`pg_roles`. `coraje_app` pierde el dueño de
  `core`/`helpdesk`, se retira de Coolify y de las credenciales de n8n, y su
  contraseña se rota — queda como único superusuario del clúster, reservado a
  emergencias humanas. Dos incidencias de exposición de credenciales en la misma
  unidad: la contraseña original de `coraje_app` pegada en el chat (lo que motivó
  ampliar el alcance), y los tres roles nuevos creados por error con los
  placeholders sin sustituir, corregido de inmediato con `\password` interactivo
  antes de que nada dependiera de ellos — adoptado como regla permanente en
  `operacion.md`. Queda pendiente de ejercitar, sin bloquear el cierre: una
  escritura real con `coraje_runtime` y una corrida de n8n con `coraje_etl`. Nueva
  acción inmediata: construir el servicio `migrate` — único escenario mínimo de U2
  que sigue sin cerrar.
- 11-sep-2026 (corte 7, mismo día) — el usuario corre n8n de verdad con `coraje_etl`
  y aparecen dos huecos reales que el `GRANT` de F6 no cubría, ninguno arreglable
  con más permisos sueltos: `staging` seguía siendo de `coraje_app` (el nodo `PG -
  Ensure Incremental Infrastructure` hace `CREATE SCHEMA`/`CREATE TABLE IF NOT
  EXISTS` ahí como parte normal de su ejecución), y el nodo `PG - Transform 02
  Clientes` traía un `CREATE UNIQUE INDEX IF NOT EXISTS` embebido contra
  `core.dim_cliente_contai` — que exige ser dueño de la tabla, a diferencia de
  `CREATE TABLE`. Búsqueda exhaustiva en los tres workflows de `n8n/` confirma que
  es la única aparición contra `core`/`helpdesk`; el resto son tablas de `staging`.
  Se transfiere `staging` completo (schema + 10 tablas) a `coraje_etl`, y se retira
  del workflow el índice de `core` — ya lo garantiza el baseline de Prisma, y
  mantenerlo en n8n contradice D1. Confirmado por el usuario: el flujo de ingesta
  corrió completo después de ambas correcciones. Publicado el recorte en
  `n8n/CORAJE - INCREMENTAL COMPLETO...json` solo después de confirmar que la
  instancia viva ya corría igual — nunca antes, para no repetir el error de F11.
  Con esto, la única salvedad de F6 que sigue sin ejercitarse es una escritura real
  con `coraje_runtime` (crear o redirigir un ticket).
- 11-sep-2026 (corte 8, mismo día) — **U2 cierra.** Se agrega la etapa `migrator` al
  `Dockerfile` (liviana, sin el build de Next) y se ensaya contra la base real antes
  de tocar el despliegue: `docker build --target migrator` + `docker run` con
  `coraje_migrator` confirma `No pending migrations to apply.`. Publicado inerte
  primero (`fa1c983`); solo tras confirmar `DATABASE_MIGRATION_URL` en Coolify se
  publica el servicio `migrate` en `docker-compose.yaml` con el gate
  `depends_on: service_completed_successfully` sobre `web` (`0f1ced5`). El deploy
  real en Coolify confirma en logs lo mismo que el ensayo manual, y `web` arranca
  después de `migrate`, no en paralelo. El usuario cierra la última salvedad de F6
  en el mismo paso: crea un ticket real desde el portal y prueba la redirección,
  confirmando `coraje_runtime` en producción por comportamiento, no solo por
  `GRANT`. Los cuatro escenarios mínimos de U2 quedan cerrados y ejercitados.
  `plan-ejecucion.md` se actualiza: U2 cerrada, **U3 (identidad de empleados) pasa a
  ser la cabeza de la cola.**
- 15-sep-2026 (corte 9) — el usuario pide continuar con U3. Antes de diseñar, se
  pregunta si HelpDesk debe apoyarse en el login de Conecta: el usuario responde que sí
  usa Entra ID, lo cual contradecía lo que se sabía. Se resuelve la contradicción con
  evidencia, no por afirmación: clonado el repositorio real de Conecta (`RBGCT-REACT`,
  autorizado explícitamente por el usuario), se confirma que `main` (lo desplegado) usa
  JWT propio, sin Entra ID, y que una rama sin mergear (`stiben`) agrega un botón de
  Microsoft que igual termina en el JWT propio de Conecta — ninguna sesión de Entra real
  sale de ahí. Se descarta acoplar HelpDesk a Conecta (mismas razones ya escritas en
  `acceso-empleados.md` §2) y se confirma que el SSO silencioso contra el mismo tenant
  sigue siendo la vía correcta, sin depender de Conecta. D7 (`contexto-canonico.md`
  §1.1) queda resuelto para efectos de esta unidad. Se construye el módulo completo:
  `entra-oidc.ts` (protocolo, validación de `id_token`), `employee-admission.ts`
  (admisión pura, cuatro rechazos), `employee-session.ts`/`current-employee.ts`
  (sesión), rutas de `/api/auth/microsoft/{start,callback}` y `/api/auth/logout`,
  `login`/página raíz nuevas. Esquema: `rol_aplicacion` (enum de un solo valor,
  `AGENTE`) y `entra_object_id` en `dim_personal`; nuevo schema `app` con
  `employee_session`; migración escrita a mano (sin acceso a la base real desde este
  entorno). Se agrega `pnpm test` (primera suite del repositorio, 26 pruebas
  unitarias) tras resolver un problema real de `node --test` con directorios cuando
  `tsx` está activo como loader (se pasa un glob explícito sobre archivos `.test.mts`,
  no un directorio). Verificado en local con FNM (Node 24.16.0): `prisma generate`,
  `tsc --noEmit`, `eslint`, `next build` y los 26 tests, todos limpios. Publicado en
  `660fd2b` (código) y `10856c8` (documentación), con el fetch/push confirmando que
  ninguna otra sesión había publicado nada mientras tanto. **U3 no cierra**: sin App
  Registration en Entra ID, sin la clave de sellado en Coolify, sin nadie con
  `rol_aplicacion` asignado, y sin ejercitar la migración contra la base real — los
  cuatro quedan como acción inmediata, explícitos en la cabecera. El usuario confirma
  que hará push consciente del riesgo del índice único parcial antes de que corra la
  migración.
- 15-sep-2026 (corte 9, mismo día) — el usuario pregunta si conviene aplazar el
  ejercicio real de U3 hasta que el resto del producto esté construido. Se responde
  que el código ya publicado no se pierde aplazando, pero que U4/U6-U7/U8 dependen de
  que alguien pueda entrar de verdad — U5 (contrato de diseño) es la única unidad
  siguiente libre de esa dependencia. A continuación pregunta si HelpDesk debería
  reutilizar el App Registration de Conecta en vez de crear uno propio, para no
  registrar una aplicación nueva. Se le explica que la validación de audiencia no se
  rompe (mismo `client_id` deja de ser "otra aplicación"), pero que el acoplamiento
  administrativo sí es real y gratuito de evitar (ver riesgo nuevo en §6). **El
  usuario decide reutilizar el App Registration de Conecta de todas formas**, contra
  la recomendación dada. El código no cambia — `entra-oidc.ts` ya es agnóstico al
  origen del App Registration —; se actualiza la acción inmediata (paso 1) para
  reflejar el procedimiento real (agregar redirect URI y generar un secret propio
  sobre la app existente, no crear una nueva) y se registra el riesgo aceptado.
- 17-sep-2026 (corte 9, mismo día) — al aclarar qué tipo de permiso elegir en el
  formulario de Azure ("delegados" vs. "de la aplicación"), el usuario confirma un
  caso de uso real: HelpDesk necesitará enviar correo al cliente desde la cuenta de
  quien responde el ticket. **D6 queda resuelta.** Se agregan `offline_access` y
  `Mail.Send` (delegados) al `scope` de `entra-oidc.ts` para capturar el
  consentimiento desde este despliegue, sin construir todavía el mecanismo de envío
  (el intercambio de código recibe el `refresh_token` y lo descarta sin persistirlo,
  comentado en el propio código). Se corrige de paso una imprecisión del corte
  anterior sobre el checkbox "ID tokens" de Authentication (no aplica al flujo real,
  que es `response_type=code` puro). Queda abierta, sin decidir, la necesidad de
  `Mail.Send.Shared` para un eventual envío desde el buzón compartido de la firma.
  `tsc --noEmit` y `pnpm test` (26/26) limpios tras el cambio.
- 17-sep-2026 (corte 10, mismo día) — el usuario completa en Entra ID/Coolify los
  pasos 1, 2 y 4 de la acción inmediata de U3 (App Registration reutilizado con todos
  los permisos, redirect URI, secret, cinco variables). El primer intento de deploy
  falla; el log del contenedor `migrate` revela `P3009` (migración registrada como
  fallida bloqueando nuevas) y, tras pedir el log de `_prisma_migrations`, la causa
  exacta: `permission denied for database coraje` (42501) — `coraje_migrator` nunca
  recibió `CREATE` sobre la base, solo es dueño de `core`/`helpdesk` desde F6.
  `applied_steps_count: 0`, sin DDL parcial. Se entrega la reparación (`GRANT CREATE`,
  `prisma migrate resolve --rolled-back`, redeploy) — sin confirmar su ejecución al
  cierre de este corte. En paralelo, el usuario confirma que HelpDesk cuelga de
  `https://conecta.rbgct.cloud/app/HelpDesk`, resolviendo D7 (navegación/URL,
  `contexto-canonico.md` §1.1), y pide agregar el `basePath` correspondiente. Se
  construye `src/server/auth/base-path.ts` y se corrigen todos los puntos donde
  Next.js no antepone el prefijo solo: los tres route handlers de auth
  (`NextResponse.redirect(new URL(...))` → `buildAppUrl(...)`), el `path` de las
  cookies de sesión/estado (de `/` a `/app/HelpDesk`, con los `delete()`
  correspondientes usando el mismo path), `login/page.tsx` (`<a>` → `<Link
  prefetch={false}>`, para que un prefetch no dispare el flujo de login) y la landing
  raíz (`<form action="/api/auth/logout">` → Server Action, que no necesita saber del
  basePath). Publicado en `58eb27f`, `tsc --noEmit`/`eslint`/`next build`/`pnpm test`
  (26/26) limpios. Queda pendiente, sin construir de ningún lado, la regla de proxy en
  Conecta que reenvíe `/app/HelpDesk/*` al contenedor de HelpDesk — sin ella, el
  `basePath` no tiene tráfico real que recibir.
- 18-sep-2026 (corte 10, continuación) — el usuario ejecuta la reparación completa
  contra la base real: `GRANT CREATE ON DATABASE coraje TO coraje_migrator` (con
  `coraje_app`), `prisma migrate resolve --rolled-back` sobre la imagen `migrate` ya
  construida por Coolify (confirmado por `rolled_back_at` poblado en
  `_prisma_migrations`), redeploy exitoso (columnas `rol_aplicacion`/`entra_object_id`
  confirmadas), y el `UPDATE` que asigna `rol_aplicacion = 'AGENTE'` a
  `daniellopera@rbcol.co` — la primera persona habilitada para ejercitar el ingreso.
  **De los cuatro pendientes operativos de U3, los cuatro quedan cerrados con
  evidencia real.** La única pieza que sigue bloqueando un ingreso de punta a punta es
  la regla de proxy de Conecta hacia HelpDesk (D7, navegación) — sin construir, sin
  fecha.
- 18-sep-2026 (corte 11, publicado en `cfce427`) — **se registra de forma retroactiva:
  este corte no dejó entrada de changelog en su momento.** Se resuelve D7 en sus tres
  preguntas y el prefijo pasa de `/app/HelpDesk` a `/helpdesk`. Razón, por lectura del
  repositorio real de Conecta: `App.jsx` monta `path="/app"` como su propio portal de
  empleados, con siete rutas hijas y guardia de sesión — no es un path libre del
  dominio; y un prefijo de caja mixta produce un fallo silencioso, porque una URL con
  otra caja cae en el SPA de Conecta, que redirige a su raíz sin error visible. Se
  descarta también la composición en tiempo de request: la interfaz de Conecta es un SPA
  de Vite servido como estáticos, sin layout de servidor donde inyectar un fragmento —
  el shell se replica dentro de HelpDesk (`U5`).
- 21-sep-2026 (publicado en `306d286`) — **primer defecto que solo el despliegue real
  podía revelar.** Una vez declarada la regla de enrutamiento, el ingreso terminaba en
  `https://0.0.0.0:3000/helpdesk/` con `ERR_ADDRESS_INVALID`: las redirecciones de
  `/api/auth/microsoft/callback` y `/api/auth/logout` se construían como URL absoluta
  sobre `request.url`, que detrás del proxy de Coolify se arma con el Host del socket
  interno del contenedor, no con el que pidió el navegador. `basePath` y la regla de
  Traefik estaban bien — el prefijo aparecía intacto en la URL rota. `buildAppUrl()` se
  sustituye por `buildAppPath()` más `redirectWithinApp()`
  (`src/server/auth/app-redirect.ts`), que emite la respuesta a mano porque
  `NextResponse.redirect()` exige URL absoluta y lanza ante una ruta relativa. Se
  descarta reconstruir el origen desde `x-forwarded-proto`/`x-forwarded-host`: obliga a
  validarlos contra lista blanca, porque un Host inyectado por el cliente convertiría
  cada redirección en un *open redirect*.
- 22-sep-2026 (corte 12) — **U3 CIERRA, ejercitada contra el despliegue real.** El
  usuario completó la configuración pendiente (dominio con path en Coolify, redirect URI
  de Entra y `ENTRA_REDIRECT_URI` en `/helpdesk`) y el ingreso funcionó de punta a punta.
  Al preparar el cierre apareció una contradicción documental que este handoff había
  colapsado: su cabecera reducía el criterio de cierre de U3 a «un ingreso real», pero
  `plan-ejecucion.md` §U3 exige **ocho escenarios mínimos**, y la cola de unidades tiene
  más autoridad que el handoff fechado. Se ejercitaron seis contra el despliegue (§4);
  `NOT_REGISTERED` y `EMAIL_INVALID` quedan con cobertura unitaria únicamente, por
  imposibilidad material de reproducirlos sin una cuenta del tenant ajena al directorio
  o un `id_token` sin correo válido. Dos incidencias del propio procedimiento de prueba,
  ambas resueltas y ambas informativas: revertir una sola de las dos columnas de
  `dim_personal` dejó al usuario fuera dos veces —la restauración debe fijar
  `estado_activo` y `rol_aplicacion` a la vez—, y encadenar flujos de ingreso sin
  terminar el primero produjo `STATE_MISMATCH`, que resultó ser prueba negativa real del
  uso único del estado OIDC. Se descartó por inspección la hipótesis de que las
  pantallas sin estilo delataran *strip prefix*: `/login` y la landing están sin estilo a
  propósito (el contrato de diseño es `U5`), y que el preflight de Tailwind se aplique
  demuestra que los assets sí cargan. Queda registrado un residuo sin acción asignada:
  manipular la cookie deja viva la sesión anterior hasta su expiración. **U4 pasa a ser
  la cabeza de la cola**, con urgencia mayor que antes: `/helpdesk/portal` quedó
  accesible desde el dominio público sin exigir identidad, cosa que hasta este corte era
  un prototipo sin tráfico.
- 23-sep-2026 (corte 13) — **U4 cierra.** Existe perímetro *deny-by-default* y
  desaparecen las dos formas de entrar que no eran identidad: la clave compartida de
  redirección y el portal de clientes sin credencial. F1 y F2 se cierran, F1 **por
  eliminación y no por protección** — decisión del usuario ante el hecho de que `U8`
  está bloqueada por D2/D3/D4 sin fecha; consecuencia que el documento registra en vez
  de disimular: HelpDesk no tiene hoy canal externo de recepción. Se adelantó el paso 5
  de `acceso-clientes.md` §11 sobre los cuatro que lo precedían, y la razón no fue de
  diseño sino de exposición. Del proyecto hermano se adaptó `src/proxy.ts` **sin heredar
  su deuda**: allí la redirección se construye sobre `request.url`, que es exactamente
  el defecto que `306d286` había corregido aquí. Dos correcciones nacidas de las propias
  pruebas: la que exige que la clave no reaparezca atrapó un comentario recién escrito
  que la nombraba, y la de Server Actions se extendió a todo `src/` al mover la acción
  de redirección fuera de `src/app`, porque si no habría dejado de comprobar nada en
  silencio. En la misma sesión, y a petición del usuario, **se retiró el frontend
  heredado completo** (`1937589`): la aplicación queda en cinco rutas y sin un solo
  valor visual, que es la condición de partida que `U5` necesitaba. Queda sin verificar
  —y declarado como salvedad, no como detalle— cómo llega el prefijo `/helpdesk` al
  pathname dentro del proxy real: se neutralizó, no se demostró. **U5 pasa a ser la
  cabeza de la cola**.
- 23-sep-2026 (corte 13, cierre de sesión) — **D5 resuelta: acento visual propio**, no
  el de Impulsa; qué acento exactamente queda como trabajo de `U5`, con las tres
  restricciones de `design/sistema-helpdesk.md` §2. U5 arranca sin decisión pendiente de
  usuario. El usuario confirma además que el portal retirado **no contenía lógica de
  negocio rescatable** —era una lista donde cualquier cliente alcanzaba la vista de
  otro, sin nada resuelto del lado del ticket—, lo que cierra la duda de si F1 se cerró
  perdiendo algo: no. Registrado en `acceso-clientes.md` §1 como criterio para
  construir ese contrato sin buscar compatibilidad con un comportamiento anterior que
  nunca fue correcto.

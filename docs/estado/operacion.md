# Operación y despliegue

```
ESTADO:    durable — reglas operativas vigentes, no estado de corte
CORTE:     03-sep-2026
EVIDENCIA: lectura de `docker-compose.yml`, `coraje-web/docker-compose.yaml`,
           `coraje-web/Dockerfile` y los `.env.example`. NO se verificó el estado real
           de ningún servidor, contenedor ni instancia de n8n
```

Runbook de operación de HelpDesk. **No contiene estado del corte** (eso vive en
`estado/handoff.md`) ni metodología general de cambio seguro (eso vive en las skills).
Cambia solo cuando cambia la infraestructura.

## Entornos

| Elemento | Valor |
|---|---|
| Repositorio local | `C:\Users\daniellopera\apps\HelpDesk-Coraje` |
| Rama principal | `main` |
| Aplicación | `coraje-web/` |
| Node | 24.16.0, fijado en `coraje-web/.node-version` |
| Gestor de paquetes | pnpm 11.2.2, fijado en `packageManager` |
| PostgreSQL local | 18-alpine, `docker-compose.yml` de la raíz, puerto **5434** en loopback |
| Despliegue | Coolify, red externa `coolify`; la app se une además a `coraje_net` |
| n8n | **Fuera de este repositorio.** No aparece en ningún compose de aquí |

> **Se retira el ciclo local (decisión 03-sep-2026).** Hasta este corte existía un ciclo
> real de `docker compose up -d` + `pnpm dev` contra PostgreSQL local, deliberadamente
> distinto de Impulsa. Se decidió abandonarlo: verificar en local es pérdida de tiempo
> para esta app. **La verificación funcional pasa a ser siempre vía commit + push** a lo
> desplegado (amend cuando aplique). `docker compose` de la raíz puede seguir usándose
> para chequeos estáticos antes de publicar, pero **ningún comportamiento se da por
> válido hasta verse desplegado**.
>
> **`RIESGO` transición sin cerrar.** Esta decisión presupone el servicio `migrate` de
> un disparo (ver más abajo) que gatee el arranque de `web` en cada despliegue, igual
> que en Impulsa. Ese servicio **todavía no existe** — es objeto de U2. Hasta que se
> construya, no hay ciclo local ni gate de despliegue: no hay ninguna forma documentada
> de verificar comportamiento real. No tratar "commit + push" como método de
> verificación ya operativo antes de que U2 cierre.

Verificación estática antes de publicar:

```bash
cd coraje-web
pnpm exec tsc --noEmit
pnpm lint
pnpm build
git diff --check
```

> **`pnpm test` existe desde U3** (pruebas unitarias sin base de datos); `pnpm
> typecheck` no.

## Esquema de la base y transformaciones

**El esquema se gestiona con migraciones Prisma** (`contexto-canonico.md` §4, D1),
versionadas en `coraje-web/prisma/migrations/`. La primera,
`20260910000000_baseline`, se escribió a mano contra la base viva y se adoptó con
`prisma migrate resolve --applied`, sin ejecutar DDL (U2, 11-sep-2026). Conserva los
`CHECK`, los índices parciales, las funciones y los triggers que el DSL de
`schema.prisma` no representa: **antes de correr `migrate dev` o `diff`, léela**, o
esos objetos parecerán sobrantes.

Disparo: commit + push a `main` → Coolify redespliega → el servicio `migrate`, de un
solo disparo, corre `prisma migrate deploy` como `coraje_migrator` y **bloquea el
arranque de `web`** hasta terminar bien. Nadie corre `migrate deploy` a mano. Si una
migración falla, `web` no arranca: toda migración que haga `CREATE OR REPLACE` o
`ALTER` sobre un objeto existente exige verificar antes, contra la base real, que su
dueño es `coraje_migrator`.

**Las transformaciones de la ingesta viven solo en los nodos `PG - Transform NN` del
workflow `n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`.** Se
ejecutan en PostgreSQL; n8n solo envía el SQL. La carpeta `sql/` se retiró el
24-sep-2026: su DDL estaba sustituido por el baseline y sus copias de las
transformaciones ya no coincidían con lo que corre (02, 03 y 05 diferían en lógica). Un
cambio en una transformación se hace en el workflow, se exporta desde la instancia y
se versiona como bloque. Para revisar el SQL, se extrae del JSON.

## Consultas SQL directas contra la base (diagnóstico, no despliegue)

**Regla dura: ninguna sesión de Claude Code se conecta nunca directamente a la VPS —
ni por `ssh`, ni por `docker exec`, ni por ningún otro canal —, incluso si encuentra
material de llave localmente (`~/.ssh/`) que en teoría lo permitiría.** Confirmado el
10-sep-2026: existen entradas de `ssh` para la VPS en el equipo local y una sesión
intentó usarlas; el usuario la detuvo explícitamente y pidió que quedara escrito para
que no se repita. La razón no es solo la ausencia técnica de Docker en el entorno de la
sesión (eso cambia con el tiempo; la regla no) — es que **toda operación contra la base
de producción con datos reales pasa siempre por revisión humana antes de ejecutarse**,
sin excepción por conveniencia o por tener credenciales disponibles.

Toda consulta o comando SQL de diagnóstico o de cambio de esquema se **entrega como
texto exacto, listo para copiar**, y lo corre el usuario manualmente en la VPS, como
root, contra el contenedor real. Patrón que funcionó, con las dos trampas que ya costó
descubrir:

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
<consulta o consultas separadas por ;>
"
```

- Usuario `coraje_app`, base `coraje`, contenedor `coraje_postgres` — son los valores
  reales de la VPS de producción, confirmados por el usuario el 10-sep-2026. Hasta ese
  corte se documentaban como `$POSTGRES_USER`/`$POSTGRES_DB` (placeholder deliberado,
  para no escribir el nombre de usuario junto al riesgo de credencial única de `F6`); el
  usuario decidió explícitamente que el comando debe quedar copiable tal cual, sin que
  quien lo corra tenga que resolver una variable de entorno primero. La contraseña
  **no** se documenta aquí bajo ningún concepto — eso sigue siendo secreto real y
  `psql`/Docker ya la resuelven desde el entorno del contenedor sin que el comando la
  necesite explícita.
- **Desde el cierre de F6 (11-sep-2026), `coraje_app` es exclusivamente para esto:
  diagnóstico y administración humana de emergencia.** Ningún sistema automático se
  conecta con ella — `web` usa `coraje_runtime`, n8n usa `coraje_etl`, y el futuro
  servicio `migrate` usará `coraje_migrator`. Su contraseña fue rotada ese mismo día,
  después de que quedara expuesta en texto plano en una sesión de Claude Code al pegar
  la salida de un comando `docker run` (ver changelog). El patrón de este documento
  sigue siendo válido para diagnóstico de solo lectura o cambios de esquema puntuales;
  ya no lo usa nada que corra sin supervisión humana directa.
- **Cada invocación de `docker exec ... psql -c "..."` abre una conexión nueva.** Una
  tabla `TEMP` creada en una invocación **no existe** en la siguiente — hay que crear y
  consultar la tabla temporal **dentro del mismo `-c "..."`**, con todos los `;` que
  hagan falta, no en pasos separados.
- Para diagnósticos que requieren "encontrar el valor real y luego consultarlo con ese
  valor", preferir una sola consulta autocontenida (CTE + subconsultas correlacionadas)
  en vez de pedir que se copie un resultado a mano a una segunda consulta — evita el
  error de pegar un marcador de posición sin reemplazar.

## Despliegue

`coraje-web/docker-compose.yaml` define **un solo servicio**, `web`, construido desde el
`Dockerfile` local y unido a dos redes externas: `coolify` para la entrada y
`coraje_net` para alcanzar PostgreSQL.

Diferencias con Impulsa que conviene conocer antes de copiar cualquier procedimiento
suyo. Las dos primeras filas dejaron de ser diferencia de fondo — están **decididas
igual que Impulsa**, solo falta construirlas (U2):

| | Impulsa | HelpDesk |
|---|---|---|
| Servicio de migración | `migrate` de un disparo, la app espera a que termine bien | **Decidido igual, no construido** — objeto de U2 |
| Credenciales de base | Separadas: migración y runtime | **Construido y cerrado (F6, 11-sep-2026)** — ver detalle abajo |
| Worker de reintentos | Servicio propio, con `read_only` y `cap_drop: ALL` | **No existe** — HelpDesk no tiene worker: no hay proceso permanente que lo justifique (`CLAUDE.md`, economía de recursos) |
| Endurecimiento de contenedores | `read_only`, `no-new-privileges`, `cap_drop` | **No aplicado** |

> **`F6` cerrado (11-sep-2026): cuatro roles en vez de una credencial única, y ya no es
> superusuario compartido.** `coraje_migrator` es dueño de todos los objetos de `core` y
> `helpdesk` (14 tablas, 8 funciones) — lo usará el futuro servicio `migrate`.
> `coraje_runtime` tiene solo DML (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) sobre `core` y
> `helpdesk`, sin `staging` — es lo que usa `web` hoy. `coraje_etl` tiene DML sobre
> `staging`+`core`+`helpdesk` — es lo que usa n8n hoy. `coraje_app` sigue existiendo
> (sigue siendo el único superusuario del clúster — no había otro, y retirárselo del
> todo sin un admin de respaldo era un cambio sin vuelta atrás), pero **ya no lo usa
> ningún sistema automático**: queda reservado para administración humana de
> emergencia, con su contraseña rotada. `ALTER DEFAULT PRIVILEGES` asegura que las
> tablas/funciones que `coraje_migrator` cree en migraciones futuras ya lleguen
> concedidas a `coraje_runtime`/`coraje_etl`/`coraje_app` sin repetir el `GRANT` cada
> vez. Verificado por consulta a `pg_class`/`pg_roles` contra la base real — **la ruta
> de escritura (crear/redirigir un ticket, o una corrida de n8n con `coraje_etl`) no se
> ha ejercitado todavía**, queda como verificación pendiente, no como bloqueo.
>
> **Incidencia real durante esta rotación:** el primer intento de crear los tres roles
> nuevos se corrió con los placeholders de contraseña sin sustituir — quedaron con
> contraseñas literales y adivinables por unos minutos, sin que nada dependiera todavía
> de ellas. Se corrigió de inmediato con `\password <rol>` en una sesión interactiva de
> `psql`, no con `-c "ALTER ROLE ... PASSWORD '...'"` — ese patrón deja la contraseña en
> el historial de la shell y, en este flujo de trabajo, en el propio chat si se pega la
> terminal de vuelta. **Regla en adelante: todo cambio de contraseña real usa `\password`
> interactivo, nunca `-c` con el valor inline.**

## Variables de entorno

> **`coraje-web/docker-compose.yaml` es la lista completa de variables de `web`**, y
> `src/server/env.contract.test.mts` falla si el código lee una que no está. Coolify
> inyecta además las que tiene definidas (comprobado el 01-oct-2026 con `printenv`), así que
> la lista **no crea** ninguna: una variable que no existe en Coolify llega vacía.
> **Variable nueva = crearla en Coolify + declararla en el compose.** Comprobar en la VPS
> qué tiene `web` de verdad, sin imprimir valores:
>
> ```bash
> docker exec $(docker ps --filter "name=web" --format "{{.Names}}" | head -1) printenv | cut -d= -f1 | grep -E "N8N_|HELPDESK_|ENTRA_" | sort
> ```
>
> Corrección del 01-oct: el corte 30 afirmó aquí que sin estar en el compose una variable
> no llegaba. Era falso. Lo que faltaba era **crear** `N8N_PORTAL_MAIL_*` en Coolify: el
> portal nunca ha podido enviar invitaciones ni códigos.

| Variable | Dónde | Para qué |
|---|---|---|
| `POSTGRES_*` | Raíz | Contenedor de PostgreSQL local |
| `DATABASE_URL` | `coraje-web` | Conexión de Prisma |
| `N8N_OUTBOX_KICK_URL` | `coraje-web` | Webhook que despierta el consumo del outbox |
| `N8N_OUTBOX_KICK_SECRET` | `coraje-web` | Secreto de ese webhook, cabecera `x-coraje-secret`. **El mismo valor** va en la credencial de n8n «HelpDesk salida · x-coraje-secret» |
| `N8N_PORTAL_MAIL_WEBHOOK_URL` | `coraje-web` (Coolify) | U8: URL **HTTPS** del webhook `helpdesk/portal/correo-v1` del workflow `HELPDESK - Portal - Enviar correo V3`. Sin ella, ni invitaciones ni códigos salen: el fallo queda en `app.portal_auditoria` con el nombre de la variable |
| `N8N_PORTAL_MAIL_SECRET` | `coraje-web` (Coolify) | U8: secreto de ese webhook, cabecera `x-helpdesk-secret`. **El mismo valor** va en la credencial de n8n «HelpDesk correo · x-helpdesk-secret» |
| `HELPDESK_ESCALAR_AVISOS_SECRET` | `coraje-web` (Coolify) | U15: secreto de `/api/interno/avisos/escalar`, cabecera `x-helpdesk-secret`. **El mismo valor** va en la credencial de n8n «HelpDesk escalamiento · x-helpdesk-secret». Sin él, la ruta responde 503 y no escala nada |

> **En n8n no hay variables de entorno de HelpDesk** (decisión del usuario del 01-oct-2026,
> igual que en Impulsa). Cada secreto compartido es una credencial *Header Auth* de n8n:
> cifrada, fuera de las exportaciones y de las expresiones, y sin reiniciar la instancia
> al cambiarla. Los webhooks se protegen con *Authentication: Header Auth* y n8n rechaza
> con 403 sin ejecutar nada. Las llamadas salientes la usan como *Generic Credential Type*.
> `n8n-workflows.contract.test.mts` falla si un workflow del repositorio vuelve a leer
> `$env`.
>
> | Credencial (*Header Auth*) | *Name* | *Value* | La usa |
> |---|---|---|---|
> | HelpDesk salida · x-coraje-secret | `x-coraje-secret` | = `N8N_OUTBOX_KICK_SECRET` | Webhook de `CORAJE - SALIDA` |
> | HelpDesk correo · x-helpdesk-secret | `x-helpdesk-secret` | = `N8N_PORTAL_MAIL_SECRET` | Webhook de `HELPDESK - Portal - Enviar correo V3` |
> | HelpDesk escalamiento · x-helpdesk-secret | `x-helpdesk-secret` | = `HELPDESK_ESCALAR_AVISOS_SECRET` | `HTTP - Escalar avisos` de `HELPDESK - Escalar avisos V2` |
>
> Retirar de la instancia `CORAJE_OUTBOX_KICK_SECRET`, `HELPDESK_PORTAL_MAIL_SECRET` y
> `HELPDESK_ESCALAR_AVISOS_SECRET` **después** de importar la salida nueva: antes, el
> webhook de la salida todavía las lee.

> **El código del portal usa `HELPDESK_TOKEN_ENCRYPTION_KEY`** (ya configurada desde U3)
> a través de una subclave derivada (`deriveSubkey("portal-otp-v1")`). **Rotar esa clave
> invalida los códigos vivos** (duran 10 minutos: basta con rotar fuera de horas), además
> de lo que ya invalidaba: las cookies de estado OIDC y las autorizaciones de correo
> selladas.

> **`REDIRECCION_PASSWORD` ya no existe** (U4, 22-sep-2026). La clave compartida del
> módulo de redirección se retiró del código junto con su pantalla de acceso, y la
> variable se borró del servicio en Coolify. Una prueba de `pnpm test` falla si el
> nombre reaparece en `src/`.

> `coraje-web/.env.example` declara **solo** `DATABASE_URL`. Las dos variables de n8n
> las lee el código y no están documentadas allí: un despliegue nuevo arranca sin ellas
> y la cola de salida queda muda, con una advertencia en el log y nada más. **Corregir
> el `.env.example` es trabajo de una línea y evita un fallo silencioso.**
>
> A esa lista le faltan además las cinco variables de identidad que U3 introdujo y la
> clave de sellado — todas configuradas en Coolify, ninguna declarada en el ejemplo.

## n8n

- Los workflows viven en `n8n/`. **No se parchean**: los cambios funcionales se versionan
  por bloques.
- `git ls-files n8n/` solo lista **un** archivo commiteado: el workflow de ingesta
  (`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json`). Los otros tres que
  hoy están físicamente en la carpeta son `??` — nunca se hizo `git add` de ninguno:
  - `REVISORIA - Inspeccion SharePoint Vacaciones y Tareas V2.json` **es el consumidor
    del outbox**, pese a lo que dice su nombre — verificado leyendo sus nodos y sus
    queries (`specs/sincronizacion-sharepoint.md` §2.2, §4.2). Su nombre no refleja su
    función en absoluto: probablemente viene de duplicar o reciclar un workflow real de
    otro dominio (inspección de vacaciones/tareas de Revisoría) sin renombrarlo antes de
    exportar. **Renombrar y commitear antes de que alguien lo borre creyendo que es
    basura de otro proyecto.**
  - `CORAJE - INCREMENTAL COMPLETO V2 - SharePoint to PostgreSQL.json` y
    `...V2.1...json` son **copias inactivas** de la ingesta (`active: false` en su
    export, cada una con un `id` de workflow de n8n distinto entre sí y del archivo
    commiteado — no es historial secuencial de una sola entidad, son duplicados
    separados). El archivo commiteado es el único `active: true` en su export. Un
    export no es la instancia viva: **confirmar en n8n cuál está realmente activa antes
    de borrar las otras dos.**
- Un workflow sin manejo de error es una falla silenciosa programada. **Confirmado
  ausente** (10-sep-2026): no hay `errorWorkflow` en la configuración exportada del
  consumidor, y el usuario lo corroboró directamente. **Resuelto el 24-sep-2026 (V10):**
  «Alertas de errores a Teams» es el `errorWorkflow` de la ingesta, la salida, el correo
  del portal y, desde U10, la salud diaria.

### Espejo en PowerApps y regla de precedencia (U9)

`specs/sincronizacion-sharepoint.md` §4.3. Tres piezas que se despliegan juntas: la
migración `20260928120000_espejo_sharepoint` y las versiones U9 de
`CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json` y
`CORAJE - SALIDA - PostgreSQL to SharePoint.json`.

**Orden obligatorio.** La salida que hoy está activa en n8n es la versión anterior. Solo
crea ítems, lleva el marcador «PRUEBA CORAJE - BORRAR» y no consulta el interruptor.
Desde la migración, el trigger empieza a encolar, así que con esa versión activa los
tickets del portal clasificados irían a HelpDeskBd.
1. **Desactivar** en n8n el workflow `CORAJE - SALIDA - PostgreSQL to SharePoint`.
2. Publicar: `migrate` aplica la migración.
3. **Importar las dos versiones U9** sobre los mismos workflows (mismo `id`). Comprobar
   que los nodos Postgres usan «Postgres account Daniel» y los HTTP «Microsoft SharePoint
   account».
4. Activar la salida. Con el espejo apagado no envía nada: solo mantiene la cola.

Mientras la ingesta vieja corra entre los pasos 2 y 3, no daña nada: ningún ticket de
HelpDesk está todavía en SharePoint.

**Encender y apagar el espejo** (decisión del usuario, no del despliegue):

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
UPDATE helpdesk.espejo_sharepoint
SET activo_desde = NOW(), motivo = 'Encendido para <motivo>', updated_at = NOW()
RETURNING activo_desde;
"
```

Apagar es `SET activo_desde = NULL`. Solo se refleja lo encolado desde `activo_desde`.

**Despertar la salida en cada cambio:** la aplicación llama al webhook
`coraje/outbox/kick` con `N8N_OUTBOX_KICK_URL` y `N8N_OUTBOX_KICK_SECRET` (Coolify; el
secreto coincide con la credencial «HelpDesk salida · x-coraje-secret» del webhook en n8n). Sin ellas, lo encolado sale en
la pasada programada, cada 12 horas.

**Mirar el estado:**

```sql
SELECT operation, status, attempts, last_error, updated_at
FROM helpdesk.ticket_sync_outbox ORDER BY updated_at DESC LIMIT 20;

SELECT campo, valor_sharepoint, resultado, motivo, detectado_at
FROM helpdesk.sync_divergencia ORDER BY detectado_at DESC LIMIT 20;

SELECT * FROM helpdesk.v_actividad_powerapps ORDER BY semana DESC LIMIT 12;
```

### Correo del portal de clientes (U8)

Workflow `n8n/HELPDESK - Portal - Enviar correo V3.json`. Envía invitaciones y códigos
desde el buzón sin dueño `automatizacionmedellin@rbcol.co` (D4,
`specs/acceso-clientes.md` §11). **Puesta en marcha, una sola vez:**

1. **App Registration «GCT - Conecta RBG»**, en *Authentication*: añadir la redirect URI
   de n8n, `https://<n8n-de-helpdesk>/rest/oauth2-credential/callback`. **No** añadir
   ningún permiso de aplicación: bastan los delegados que ya tiene (`Mail.Send.Shared`,
   `offline_access`).
2. **Credencial en n8n**, tipo *Microsoft OAuth2 API*, con el nombre
   `Graph automatizacionmedellin`: client ID y secreto de esa App Registration, scope
   `https://graph.microsoft.com/Mail.Send.Shared offline_access`. **Cambiar `common` por el
   ID del tenant** (`ENTRA_TENANT_ID`) en *Authorization URL* y *Access Token URL*: la App
   Registration es de un solo tenant y `/common` falla con `AADSTS50194` (visto el
   01-oct-2026). El buzón es compartido
   y **no tiene inicio de sesión propio**: la autoriza **una persona con *Send As***
   sobre `automatizacionmedellin@rbcol.co`, con su propia cuenta. El nodo
   `HTTP - Graph sendMail` envía a `/users/automatizacionmedellin@rbcol.co/sendMail`, así
   que el correo sale desde el buzón, no desde esa persona. Comprobar el *Send As* antes:
   en Outlook web, enviar un correo eligiendo el buzón en «De»; si llega «X en nombre
   de…», es *Send on Behalf* y no sirve.
3. **Importar el workflow**, abrir el nodo `HTTP - Graph sendMail` y elegir esa
   credencial (el export trae `REEMPLAZAR_AL_IMPORTAR`). Confirmar en *Settings* que
   **Save successful/failed executions = Do not save**: el cuerpo lleva el código.
4. Credencial *Header Auth* «HelpDesk correo · x-helpdesk-secret» en el nodo `Webhook`
   (*Name* `x-helpdesk-secret`, *Value* igual a `N8N_PORTAL_MAIL_SECRET`), y las dos `N8N_PORTAL_MAIL_*`
   en Coolify (tabla de variables).
5. Activar el workflow.

**Consecuencia de compartir la App Registration:** su secreto vive ahora también en la
credencial de n8n. **Rotarlo exige actualizar tres sitios**: Conecta, HelpDesk (Coolify)
y esta credencial. Si la credencial deja de valer (contraseña de la persona que la autorizó cambiada,
sesiones revocadas, unos 90 días sin enviar), los códigos no llegan: se reautoriza la
credencial en n8n.

### Asignar los roles de U8

`CLASIFICADOR` (redirige tickets del portal) y `ADMIN` (administra accesos de clientes)
se asignan por `psql`, como `COLABORADOR` (antes `AGENTE`, renombrado el 30-sep-2026).
**Una persona tiene un solo rol**; los dos incluyen todo lo de `COLABORADOR`. Qué área
ve alguien no depende del rol sino del enrutamiento (`specs/permisos.md` §4.5):

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
UPDATE core.dim_personal
SET rol_aplicacion = 'ADMIN'
WHERE LOWER(correo_corporativo) = 'persona@rbcol.co'
  AND estado_activo
  AND NOT es_responsable_historico_no_identificado
RETURNING correo_corporativo, rol_aplicacion, estado_activo;
"
```

La fila debe volver con `estado_activo = t`. Cambiar el rol surte efecto en la siguiente
petición de esa persona; no hace falta que vuelva a entrar.

### Suplantación para pruebas (bloque temporal)

Una persona habilitada trabaja como cualquier empleado **activo y con rol** desde el
selector «Trabajar como», encima del contenido de cada vista. Recibe su bandeja y sus
permisos; lo que haga queda a nombre de esa persona. Los correos que genere salen de su
propio buzón y llegan **solo a ella**, con el asunto `[Prueba · para <dirección>]`. Las
invitaciones y los códigos del portal no se desvían: van a la dirección que se escribe.
Vive en producción por decisión del usuario (29-sep-2026). Migración
`20260929100000_suplantacion_pruebas`; código en `src/server/auth/suplantacion.ts`.

**Habilitar y deshabilitar** (la aplicación solo lee esta tabla):

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
INSERT INTO app.suplantacion_habilitada (id_personal, nota)
SELECT id_personal, 'pruebas'
FROM core.dim_personal
WHERE LOWER(correo_corporativo) = 'persona@rbcol.co' AND estado_activo AND NOT es_responsable_historico_no_identificado
RETURNING id_personal;
"
```

Para deshabilitar: `DELETE FROM app.suplantacion_habilitada WHERE id_personal = '…';`.
La suplantación en curso termina en la siguiente petición.

**Qué se hizo suplantando**, para limpiar después:

```bash
docker exec -it coraje_postgres psql -U "coraje_app" -d "coraje" -c "
SELECT a.created_at, r.nombre_completo AS real, s.nombre_completo AS como
FROM app.suplantacion_auditoria a
JOIN core.dim_personal r ON r.id_personal = a.id_personal_real
LEFT JOIN core.dim_personal s ON s.id_personal = a.id_personal_suplantado
ORDER BY a.created_at DESC LIMIT 30;
"
```

**Retiro**, antes de que HelpDesk sea la herramienta de trabajo de cualquier área:
borrar `src/server/auth/suplantacion.ts`, `suplantacion.contract.test.mts` y
`src/features/suplantacion/`; quitar los bloques `SUPLANTACIÓN — bloque temporal` …
`FIN SUPLANTACIÓN` de `schema.prisma`, `current-employee.ts`, `employee-session.ts`,
`AppFrame.tsx` y `ticket-notifications.ts`; y una migración nueva con
`DROP TABLE app.suplantacion_auditoria, app.suplantacion_activa, app.suplantacion_habilitada;`.
`grep -rn "SUPLANTACIÓN\|suplantacion" src prisma/schema.prisma` no debe devolver nada.

### Salud diaria (U10)

`specs/observabilidad.md`. La migración `20260928130000_observabilidad` y el workflow
`n8n/HELPDESK - Salud diaria V1.json`. **Puesta en marcha, una sola vez**, después de
publicar:

1. **Importar el workflow** como workflow nuevo. Comprobar que el nodo Postgres usa
   «Postgres account Daniel» (tiene que ser `coraje_etl`: es el único rol que ve
   `staging`) y el HTTP, «Microsoft SharePoint account».
2. En *Settings*: **Timezone = America/Bogota** y **Error workflow = Alertas de errores a
   Teams**. El export los trae, pero un import puede no conservar el id del workflow de
   error.
3. **Ejecutarlo a mano una vez** y comprobar que termina en *Success*, o en el aviso
   «SALUD DIARIA DE HELPDESK» si ya hay algo crítico. Esa primera fila es la línea base
   (§7 de la spec).
4. Activarlo.

**A Teams solo llega lo crítico, y solo cuando aparece o empeora** (decisión del
28-sep-2026). Todo lo demás está en HelpDesk › Salud, que ven las personas con rol
`ADMIN`. **Atiende el canal: Juan Felipe Zuluaga Mejía** (`felipezuluaga@rbcol.co`, 28-sep-2026).

**Mirar a mano:**

```sql
-- Lo que no está en verde ahora (sin la reconciliación, que solo calcula la diaria).
SELECT * FROM helpdesk.salud_hallazgos();

-- Las últimas revisiones: hallazgos, qué se avisó y conteos de la reconciliación.
SELECT ejecutada_at, criticos_nuevos, items_sharepoint, items_staging, items_con_ticket, hallazgos
FROM helpdesk.revision_salud ORDER BY ejecutada_at DESC LIMIT 5;
```

**Registros del servidor:** una línea JSON por evento en `docker logs` del contenedor
`web`. Para seguir un ticket: `docker logs <web> 2>&1 | grep '"idTicket":"<uuid>"'`.

### Avisos y escalamiento (U15)

Los avisos a empleados no necesitan nada en n8n: se escriben en la base con cada
acción. El **escalamiento** diario sí. **Puesta en marcha, una sola vez:**

1. Generar un secreto (`openssl rand -hex 32`) y ponerlo como
   `HELPDESK_ESCALAR_AVISOS_SECRET` en Coolify (`coraje-web`). Redesplegar `web`.
2. En n8n, crear la credencial *Header Auth* «HelpDesk escalamiento ·
   x-helpdesk-secret»: *Name* `x-helpdesk-secret`, *Value* el mismo secreto.
3. Importar `n8n/HELPDESK - Portal - Enviar correo V3.json`: elegir
   `Graph automatizacionmedellin` en `HTTP - Graph sendMail` y «HelpDesk correo ·
   x-helpdesk-secret» en `Webhook`, activarlo y **desactivar las versiones anteriores**.
   Mismo webhook (`helpdesk/portal/correo-v1`): no cambia ninguna variable de Coolify.
   Sin V3, el escalamiento falla con «Tipo de correo no soportado».
4. Importar `n8n/HELPDESK - Escalar avisos V2.json`, elegir «HelpDesk escalamiento ·
   x-helpdesk-secret» en `HTTP - Escalar avisos`, comprobar que *Settings → Error
   workflow* es `Alertas de errores a Teams` y activarlo. Corre de lunes a viernes a las
   7:00; la base descarta los festivos.

**Mirar el estado:**

```sql
SELECT fecha, estado, avisos, intentos, ultimo_error, enviado_at
FROM helpdesk.aviso_escalamiento ORDER BY created_at DESC LIMIT 20;

SELECT clase, COUNT(*) FILTER (WHERE resuelto_at IS NULL AND clase = 'ATENCION') AS abiertos,
       COUNT(*) FILTER (WHERE leido_at IS NULL) AS sin_leer
FROM helpdesk.ticket_aviso GROUP BY clase;
```

Ejecutar el workflow a mano el mismo día **no repite** correos enviados: solo
reintenta los `FALLIDO`.

## Cuidados sobre infraestructura compartida

- **Las listas de SharePoint las consume PowerApps en producción, hoy.** Cualquier cambio
  en el camino de salida o en los workflows puede alcanzar a personas trabajando.
- Los datos de `core` y `helpdesk` **son reales**, no de prueba. Ninguna operación
  destructiva sobre ellos está cubierta por la autorización destructiva del proyecto
  (`contexto-canonico.md` §1.3).
- Antes de cualquier operación destructiva: respaldo verificado y **restauración
  ensayada**, no solo respaldo tomado.

## Condiciones de producción

No declarar listo para producción sin: secretos productivos configurados · limpieza de
datos de prueba · smoke test controlado · **rollback ensayado**. La activación debe ser
reversible y fallar de forma explícita cuando falte una dependencia.

---

**Changelog:**
- 03-sep-2026 — línea base. Registra el ciclo local real, el modelo de esquema en SQL a
  mano, las cuatro diferencias de despliegue con Impulsa, la credencial única de base y
  las tres variables de entorno no declaradas en `.env.example`.
- 03-sep-2026 (mismo día, misma unidad) — decisión de usuario: se retira el ciclo local
  y se adoptan migraciones Prisma completas (`contexto-canonico.md` §4, D1). Ambas
  decididas, ninguna construida; U2 las ejecuta.
- 10-sep-2026 — cierre de U1. Se descubre que `n8n/` tiene tres archivos sin commit: el
  consumidor real del outbox, mal nombrado (`REVISORIA - Inspeccion SharePoint
  Vacaciones y Tareas V2.json`), y dos copias inactivas de la ingesta (`V2`, `V2.1`).
  Confirmado: no hay workflow de error en n8n.
- 10-sep-2026 (mismo día) — se documenta el patrón de consulta SQL directa contra la
  VPS (`docker exec ... psql -c`) usado para cerrar U1, con sus dos trampas reales:
  las tablas `TEMP` no sobreviven entre invocaciones, y los diagnósticos deben ser
  autocontenidos. Se aclara explícitamente que el disparador del futuro servicio
  `migrate` es commit + push, sin paso manual intermedio.
- 10-sep-2026 (mismo día) — se convierte en regla dura, tras corrección directa del
  usuario: ninguna sesión se conecta nunca a la VPS por `ssh` ni `docker exec`, así
  tenga material de llave disponible localmente. Todo comando contra producción se
  entrega como texto para que el usuario lo corra manualmente.
- 10-sep-2026 (mismo día, unidad siguiente) — el usuario decide reemplazar los
  placeholders `$POSTGRES_USER`/`$POSTGRES_DB` del patrón de consulta directa por los
  valores reales (`coraje_app`, `coraje`): un comando entregado como texto para copiar
  y pegar no debe obligar a quien lo corre a resolver una variable de entorno primero.
  La contraseña sigue sin documentarse — sigue siendo secreto real, y el comando nunca
  la necesitó explícita.
- 11-sep-2026 — **`F6` cerrado.** Al adoptar el baseline Prisma (U2) se confirma que
  `coraje_app` era además superusuario (`rolsuper`, `rolcreatedb`, `rolcreaterole`) y el
  único rol de aplicación existente en el clúster — más grave que "una credencial para
  dos propósitos". Se crean `coraje_migrator` (dueño de `core`+`helpdesk`),
  `coraje_runtime` (DML, para `web`) y `coraje_etl` (DML sobre `staging`+`core`+
  `helpdesk`, para n8n); `coraje_app` se retira de todo uso automático y queda solo
  para emergencias humanas. Dos incidencias reales durante la ejecución: (1) la
  contraseña de `coraje_app` quedó expuesta en texto plano en el chat al pegar la
  salida de un comando `docker run` (motivó escalar el alcance de F6 a los tres roles
  en vez de solo migración/runtime); (2) los tres roles nuevos se crearon con los
  placeholders de contraseña sin sustituir por error de comunicación, corregido de
  inmediato con `\password` interactivo antes de que nada dependiera de ellos. Se
  adopta `\password` como el único método aceptable para fijar contraseñas reales en
  este flujo de trabajo, en vez de `-c "ALTER ROLE ... PASSWORD"`. Pendiente de
  ejercitar (no bloqueante): una escritura real contra `core`/`helpdesk` con
  `coraje_runtime`, y una corrida de n8n con `coraje_etl`.

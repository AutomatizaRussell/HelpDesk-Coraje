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

> **No existen `pnpm typecheck` ni `pnpm test`.** No hay ninguna prueba automatizada en
> el repositorio. Cuando exista la primera, este bloque cambia con ella.

## Esquema de la base

**Decisión 03-sep-2026 (`contexto-canonico.md` §4, D1): el esquema se gestiona con
migraciones Prisma**, versionadas en el repositorio y aplicadas con `migrate deploy` al
desplegar — igual que Impulsa. Se abandona SQL a mano como fuente del esquema.

**Estado real de este corte: decidido, no construido.** Hoy el esquema sigue siendo SQL
a mano, aplicado en orden manual:

```
sql/db/00_extensions.sql → 01_schemas → 02_functions → 03_staging
   → 04_core → 05_helpdesk_dimensions → 06_helpdesk_facts → 07_seed → 08_helpers
sql/elt/*.sql        → transformaciones del pipeline SharePoint → PostgreSQL. Quedan
                        fuera de esta decisión: siguen siendo SQL a mano — es un
                        problema distinto de cómo se versiona el DDL del esquema
sql/checks/*.sql     → verificaciones de desarrollo
```

hasta que U2 (`estado/plan-ejecucion.md`) construya el baseline de migración Prisma
sobre la base viva (2.313 tickets, 439 eventos reales — no se recrea el esquema desde
cero) y fije cómo sobreviven a `migrate dev`/`diff` los `CHECK`, `UNIQUE NULLS NOT
DISTINCT` e índices parciales que el esquema ya usa, sin que alguien sin este contexto
los borre por no reconocerlos en el DSL de `schema.prisma`.

> **`RIESGO` vigente mientras dure la transición.** Hasta que U2 cierre, sigue sin haber
> historial versionado de cambios de esquema ni aplicación automática al desplegar. Un
> cambio aplicado a mano en un entorno y no en otro **no deja rastro**.

> **Cuando U2 construya el servicio `migrate`:** el disparador es siempre commit + push
> a `main`. Push → Coolify redespliega → el servicio `migrate` de un disparo corre
> `prisma migrate deploy` y **bloquea el arranque de `web`** hasta terminar bien (`depends_on:
> condition: service_completed_successfully`, igual que Impulsa) → si termina bien, `web`
> arranca con el esquema ya al día. No hay un paso manual intermedio: nadie corre
> `migrate deploy` a mano en ningún entorno.

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
docker exec -it coraje_postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
<consulta o consultas separadas por ;>
"
```

- `$POSTGRES_USER`/`$POSTGRES_DB` salen del `.env` real de la VPS — no se adivinan ni se
  documentan aquí (son el mismo secreto de siempre, ver `F6`).
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
| Credenciales de base | Separadas: migración y runtime | **Decidido igual, no construido** — cierra `F6` |
| Worker de reintentos | Servicio propio, con `read_only` y `cap_drop: ALL` | **No existe** — HelpDesk no tiene worker: no hay proceso permanente que lo justifique (`CLAUDE.md`, economía de recursos) |
| Endurecimiento de contenedores | `read_only`, `no-new-privileges`, `cap_drop` | **No aplicado** |

> **`RIESGO` Una sola credencial de base.** La aplicación se conecta con el mismo
> usuario que crea y altera el esquema. Un fallo de inyección o una dependencia
> comprometida alcanzan `DROP`, no solo `SELECT`. La skill de arquitectura exige mínimo
> privilegio y esto no lo cumple. Registrado, no corregido.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `POSTGRES_*` | Raíz | Contenedor de PostgreSQL local |
| `DATABASE_URL` | `coraje-web` | Conexión de Prisma |
| `REDIRECCION_PASSWORD` | `coraje-web` | Clave compartida del módulo de redirección. **Se retira** con `specs/acceso-empleados.md` |
| `N8N_OUTBOX_KICK_URL` | `coraje-web` | Webhook que despierta el consumo del outbox |
| `N8N_OUTBOX_KICK_SECRET` | `coraje-web` | Secreto de ese webhook |

> `coraje-web/.env.example` declara **solo** `DATABASE_URL`. Las tres variables restantes
> las lee el código y no están documentadas allí: un despliegue nuevo arranca sin ellas
> y la cola de salida queda muda, con una advertencia en el log y nada más. **Corregir
> el `.env.example` es trabajo de una línea y evita un fallo silencioso.**

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
  consumidor, y el usuario lo corroboró directamente.

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

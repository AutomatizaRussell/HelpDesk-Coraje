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

> A diferencia de Impulsa, **aquí sí existe ciclo local**: `docker compose up -d` levanta
> PostgreSQL y `pnpm dev` corre la aplicación contra él. Es una diferencia real entre los
> dos proyectos y conviene no importar por inercia la disciplina de «todo se valida en
> staging».

## Ciclo de desarrollo local

```bash
docker compose up -d                      # desde la raíz: solo PostgreSQL
cd coraje-web
pnpm install
pnpm exec prisma generate
pnpm dev
```

Verificación estática antes de publicar:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
git diff --check
```

> **No existen `pnpm typecheck` ni `pnpm test`.** No hay ninguna prueba automatizada en
> el repositorio. Cuando exista la primera, este bloque cambia con ella.

## Esquema de la base

El esquema **no se gestiona con migraciones de Prisma**. Se define en SQL a mano y se
aplica en orden:

```
sql/db/00_extensions.sql → 01_schemas → 02_functions → 03_staging
   → 04_core → 05_helpdesk_dimensions → 06_helpdesk_facts → 07_seed → 08_helpers
sql/elt/*.sql        → transformaciones, se ejecutan por el pipeline
sql/checks/*.sql     → verificaciones de desarrollo
```

Después de cualquier cambio de esquema:

```bash
cd coraje-web
pnpm exec prisma db pull      # reintrospecta
pnpm exec prisma generate     # regenera el cliente
```

> **`RIESGO`** No hay historial versionado de cambios de esquema ni aplicación
> automática al desplegar. Un cambio aplicado a mano en un entorno y no en otro **no
> deja rastro**. Es la contrapartida del modelo actual, y es parte de la decisión
> pendiente de `contexto-canonico.md` §4.

## Despliegue

`coraje-web/docker-compose.yaml` define **un solo servicio**, `web`, construido desde el
`Dockerfile` local y unido a dos redes externas: `coolify` para la entrada y
`coraje_net` para alcanzar PostgreSQL.

Diferencias con Impulsa que conviene conocer antes de copiar cualquier procedimiento
suyo:

| | Impulsa | HelpDesk |
|---|---|---|
| Servicio de migración | `migrate` de un disparo, la app espera a que termine bien | **No existe** |
| Credenciales de base | Separadas: migración y runtime | **Una sola** |
| Worker de reintentos | Servicio propio, con `read_only` y `cap_drop: ALL` | **No existe** |
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
- Hoy `n8n/` contiene **solo el workflow de ingesta**. El que consume el outbox no está
  versionado (`specs/sincronizacion-sharepoint.md` §2.2).
- Un workflow sin manejo de error es una falla silenciosa programada. **No consta que
  exista workflow de error configurado.**

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

**Changelog:** 03-sep-2026 — línea base. Registra el ciclo local real, el modelo de
esquema en SQL a mano, las cuatro diferencias de despliegue con Impulsa, la credencial
única de base y las tres variables de entorno no declaradas en `.env.example`.

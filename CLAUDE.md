# CLAUDE.md — HelpDesk

HelpDesk es la mesa de ayuda de la firma. Nace para **sustituir** a una aplicación de
PowerApps sobre listas de SharePoint, y se construye como **módulo de la plataforma
unificada**, junto a Impulsa, no como aplicación independiente. El portal de clientes
es el canal externo de recepción de tickets; el equipo interno trabaja desde la
plataforma.

`Coraje` es el nombre del **módulo** que hoy contiene el portal de clientes y la
redirección de tickets, y el nombre de la carpeta de la aplicación (`coraje-web/`).
No es el nombre del producto: el producto es HelpDesk.

> **Autorización destructiva vigente.** Todo lo que existe hoy en `coraje-web/` —
> vistas, componentes, mecanismos de acceso y estilos — se puede **eliminar y
> rehacer**. No es base a preservar, no merece rutas de compatibilidad y no hay que
> migrarlo gradualmente. Se construyó antes de que existieran las referencias de
> Impulsa y antes de que el HelpDesk completo entrara en alcance. Ver
> `docs/contexto-canonico.md` §1.3 para el alcance exacto de esta autorización y,
> sobre todo, para **lo que sí es fuente de verdad viva** y no se toca.

## Fuentes y precedencia

| Contenido | Documento |
|---|---|
| Decisiones estables y fronteras | `docs/contexto-canonico.md` |
| Contratos funcionales | `docs/specs/*.md` |
| Tokens y patrones visuales | `docs/design/sistema-helpdesk.md` |
| Estado del corte y acción inmediata | `docs/estado/handoff.md` |
| Cola de unidades de trabajo | `docs/estado/plan-ejecucion.md` |
| Runbook operativo | `docs/estado/operacion.md` |
| Evidencia empírica del legacy SharePoint | `docs/legacy/*.md` |

**Orden ante contradicción:** decisión aprobada explícita > especificación vigente del
dominio > código y migraciones vigentes > pruebas > handoff fechado > documentos
históricos.

Nombra la contradicción, no la resuelvas en silencio. Distingue siempre **estado
implementado** de **comportamiento aprobado**, y **código publicado** de **cambios
locales sin commit**.

Cada spec abre con un bloque `ESTADO / CORTE / EVIDENCIA` y cierra con una tabla
*Verificación contra código*. Léelos antes de asumir que algo existe.

**La metodología general no vive en estos documentos**, sino en las skills instaladas
en `.claude/skills/`: ciclo de trabajo y criterio de finalización, estándar de código y
comentarios, arquitectura y fronteras de herramientas, diseño y experiencia universal,
entrega y operación, reproducibilidad.

## Proyecto hermano: Impulsa

`C:\Users\daniellopera\apps\plataforma-impulsa` es el otro módulo de la plataforma, del
mismo autor y la misma empresa, y está **más maduro**: identidad corporativa federada,
autorización ejecutable, sistema de diseño centralizado, portal de clientes con acceso
seguro y operaciones durables, todo publicado y en parte ejercitado.

**Es la referencia de cómo se hacen las cosas aquí.** Ambos proyectos corren
`next@16.2.6`, `react@19.2.4` y `prisma@7.8.0` — versiones idénticas, no aproximadas —
así que el código de Impulsa es portable a HelpDesk con adaptación de dominio, no de
plataforma.

Reglas al traer algo de Impulsa:

- **Inspecciona el original antes de escribir el equivalente.** Los archivos de
  `src/server/auth/`, `src/server/authorization/`, `src/server/security/`,
  `src/proxy.ts` y `src/design-system/` llevan comentarios que explican *por qué* cada
  decisión es como es, incluida la razón por la que la alternativa obvia falla.
- **No heredes su deuda sin nombrarla.** Sus propias specs declaran brechas abiertas,
  puentes legacy y evidencia no ejercitada. Traer una pieza implica leer su bloque
  `ESTADO / CORTE / EVIDENCIA` y decidir explícitamente si el defecto conocido se
  arrastra o se corrige de entrada.
- **Adapta el dominio, no lo calques.** Impulsa gira sobre solicitudes documentales y
  OneDrive; HelpDesk gira sobre tickets, áreas y SLA. Un concepto que no tiene análogo
  no se importa para llenar un hueco.

> **Excepción: en la relación con Conecta, Impulsa NO es referencia.** Creció hasta
> despegarse de esa idea y dejó de ser un módulo suyo; su enlace *Volver a Conecta* se
> retira. HelpDesk va en dirección contraria: **debe ser —o parecer— parte de Conecta**,
> conservando su barra lateral y colgando de su URL. Cualquier patrón de integración
> copiado de Impulsa apunta al modelo equivocado (`docs/contexto-canonico.md` §1.1).
>
> **Excepción: en consumo de recursos, tampoco.** Impulsa corre app, worker de
> reintentos, servicio de migración y navegador para PDF. HelpDesk tiene el objetivo
> explícito de pesar lo menos posible en la VPS (§ siguiente).

## Economía de recursos — objetivo permanente

**HelpDesk debe consumir lo mínimo posible de la VPS, sin degradar la experiencia de
clientes ni de empleados.** No es una optimización para más adelante: es un criterio de
diseño que se aplica a lo que ya existe y a lo que se construya.

- **Antes de añadir un proceso permanente** —worker, cron, servicio de compose— hay que
  justificar por qué el trabajo no cabe en una consulta disparada bajo demanda.
- **Preferir trabajo bajo demanda a sondeo.** Un cron que pregunta cada minuto por algo
  que ocurre tres veces al día es carga constante para trabajo intermitente.
- **La base hace el trabajo de la base.** Agregaciones, filtros y conteos en SQL con
  índices, no traídos a memoria de la aplicación para procesarlos allí.
- **Medir antes de optimizar y antes de dimensionar.** Un valor elegido a ojo no es un
  argumento de eficiencia.
- La convivencia con SharePoint **es carga temporal con fecha de caducidad**: los dos
  flujos de sincronización se apagan al retirar PowerApps, y eso libera la ingesta
  incremental, el consumo de la cola y sus workflows.

## Stack

Node (FNM, `.node-version`) · Next.js App Router · TypeScript · Tailwind · Prisma ·
PostgreSQL · pnpm · Docker · n8n para orquestación · Microsoft Entra ID para identidad
interna · SharePoint como sistema legacy en convivencia temporal.

## Comandos

```
pnpm dev · pnpm build · pnpm lint
pnpm exec tsc --noEmit
pnpm exec prisma generate · pnpm exec prisma db pull · pnpm exec prisma studio
git status --short · git diff --check
```

Todos se ejecutan **dentro de `coraje-web/`**, no en la raíz del repositorio.

> **No existen `pnpm typecheck` ni `pnpm test`** como scripts en `package.json`, y no
> existe ninguna prueba automatizada en el repositorio. El typecheck se invoca por su
> forma larga. Cuando se añada el primer test, este bloque cambia con él.

A diferencia de Impulsa, aquí **sí hay ciclo local**: `docker-compose.yml` en la raíz
levanta PostgreSQL y `pnpm dev` corre la aplicación contra él. Ver
`docs/estado/operacion.md` para entornos, despliegue y el estado real del pipeline.

## Fronteras de herramientas

- **PostgreSQL** es la fuente durable y **donde se transforman los datos**: staging
  crudo de SharePoint, dimensiones, hechos, cola de salida, auditoría.
- **n8n** orquesta, dispara y confirma. **No transforma datos ni es fuente de verdad.**
  Un webhook de n8n que despierta un proceso no sustituye al registro en PostgreSQL que
  lo hizo elegible: si n8n está caído, el trabajo sigue pendiente y un cron de respaldo
  lo recoge.
- **Prisma** es acceso a datos de la aplicación. Las transformaciones analíticas y de
  migración van en SQL, en `sql/`.
- **SharePoint** es el sistema legacy. Sigue vivo **únicamente** porque la app de
  PowerApps lo consume. No es fuente de verdad para nada nuevo.
- **Microsoft Entra ID** es el proveedor de identidad de los empleados. La aplicación
  valida el `id_token` contra el tenant y emite **su propia** sesión; no reenvía tokens
  del proveedor al navegador.
- Los **workflows de n8n** viven en la carpeta `n8n/` del repositorio. No se parchean:
  los cambios funcionales se versionan por bloques. Entran en el alcance de inspección
  solo cuando la unidad toca orquestación.

## Inspección dirigida (disciplina de contexto)

**Inspecciona solo los archivos de la unidad de trabajo actual.** No recorras el árbol
completo, no leas archivos "por contexto" y no ejecutes búsquedas sin acotar directorio.

- Antes de buscar, acota: `coraje-web/src/`, `coraje-web/prisma/schema.prisma`, `sql/`,
  la ruta concreta.
- Prefiere `grep` con patrón específico sobre lectura de archivos completos.
- Nunca leas ni recorras: `node_modules/`, `.next/`, `src/generated/prisma/`, `dist/`,
  `build/`, lockfiles, `.copilot-export/`.
- Si una salida puede ser extensa, guárdala en archivo y muestra ruta, resumen y
  extractos.

Una conversación por unidad de trabajo. Al cerrarla, actualiza
`docs/estado/handoff.md` siguiendo su §8: la continuidad vive en el documento, no en el
historial del chat.

## Convenciones

- Comentarios y docstrings **en español**, densidad alta y didáctica. El texto de
  interfaz, la documentación y los mensajes de commit, en español.
- Toda autorización se valida **en servidor**. Autenticación ≠ autorización.
- Valida toda entrada en la frontera con schemas. **No hay `zod` instalado todavía**;
  la primera unidad que reciba entrada externa lo instala en lugar de validar a mano.
- Antes de introducir un valor visual directo, inspecciona el contrato centralizado. Si
  la autoridad no existe, créala en el núcleo y después consúmela. **No resuelvas con
  valores quemados en la vista.**
- **No uses `font: inherit`** en controles nativos: restablece tamaño, peso y altura de
  línea de las recetas.

### Nombres en el esquema

El esquema vive en dos mundos y hay que saber en cuál se está:

- `sql/db/*.sql` y `sql/elt/*.sql` son SQL escrito a mano, en `snake_case`, con
  esquemas `staging`, `core` y `helpdesk`. **Es la fuente del esquema hoy.**
- `coraje-web/prisma/schema.prisma` es el resultado de `prisma db pull` sobre esa base,
  así que sus modelos son `snake_case` y no llevan `@@map`.

Impulsa hace lo contrario: modelos `PascalCase` con `@@map` a `snake_case` y migraciones
Prisma versionadas. **La divergencia está declarada como decisión pendiente**, no
resuelta: ver `docs/contexto-canonico.md` §4 y `docs/estado/handoff.md`. No la resuelvas
en silencio adoptando una convención a mitad del esquema.

### Mensajes de commit

Formato `tipo(ámbito): descripción`. Tipos: `feat`, `fix`, `refactor`, `perf`, `test`,
`docs`, `build`, `chore`. El ámbito es el módulo o frente tocado.

**El asunto empieza por un verbo, o por el sustantivo técnico que cambia. Nunca por
artículo, preposición ni pronombre** — «el», «la», «una», «lo que», «de». Y nunca en
registro narrativo, metafórico o irónico. El lector es alguien que abre `git log` dentro
de un año sin haber estado en ninguna conversación: necesita saber **qué se cambió**, no
una frase que solo se entiende con el contexto del chat.

Reglas del asunto: español correcto **con tildes**, en imperativo o presente
descriptivo, ≤ 72 caracteres, sin punto final, sin mayúscula inicial tras los dos puntos.

| No | Sí |
|---|---|
| `feat(portal): el cliente ya no tiene que elegirse a sí mismo` | `feat(portal): exigir invitación individual para crear un ticket` |
| `fix(redireccion): la contraseña compartida se va` | `fix(redireccion): sustituir la clave compartida por sesión de Entra ID` |
| `docs(estado): el corte apunta a a5d8347` | `docs(estado): actualizar el corte del handoff a a5d8347` |

**Cuerpo:** prosa técnica y factual — qué cambió, por qué, y qué invariantes o
decisiones sostiene. Cierra declarando la evidencia (`tsc --noEmit`, `lint`, `build`,
pruebas ejecutadas) y **lo que quedó sin verificar**.

## Gotchas

- **No hay autenticación real en el código publicado.** El portal de clientes deja
  elegir cualquier cliente sin credencial, y la redirección interna se protege con una
  contraseña compartida en `REDIRECCION_PASSWORD`. Ambos están documentados en su propio
  código como temporales. No los trates como base de un modelo de identidad: se
  reemplazan completos (`docs/specs/acceso-empleados.md`,
  `docs/specs/acceso-clientes.md`).
- **`helpdesk.ticket_sync_outbox` es el patrón bueno y se conserva.** Fuente de verdad
  en PostgreSQL, `ON CONFLICT DO NOTHING` sobre un índice parcial único para
  idempotencia, webhook a n8n fuera de la transacción y sin capacidad de romperla. No lo
  rediseñes por gusto arquitectónico.
- **La aplicación se conecta a PostgreSQL con una sola credencial.** No hay separación
  entre usuario de migración y usuario de runtime, a diferencia de Impulsa. Riesgo
  registrado, no corregido.
- **Los datos migrados de SharePoint son reales, no de prueba**: 2.313 tickets y 439
  eventos cargados y conciliados. Cualquier operación destructiva sobre `core` o
  `helpdesk` los alcanza. La autorización destructiva de este documento **no los
  incluye**.
- **Las listas de SharePoint las consume PowerApps en producción, hoy.** Un cambio en el
  outbox o en los workflows de n8n puede afectar a personas que están trabajando.
- El pipeline incremental de ingesta vive en `n8n/CORAJE - INCREMENTAL COMPLETO -
  SharePoint to PostgreSQL.json`. **No se parchea**: se versiona por bloques.

## Contrato de diseño y de permisos — regla dura

**Valores visuales.** Ningún valor visual se escribe directamente: ni color, ni
espaciado, ni tipografía, ni radio, ni sombra, ni breakpoint, ni duración de transición.
Se consume el token. Si la autoridad no existe, **se crea o amplía en el núcleo del
contrato y después se consume** — nunca se resuelve localmente. Esto **incluye el propio
`design-system`**: un valor quemado en un archivo aislado dentro de esa carpeta es la
misma violación, solo que más difícil de encontrar.

**Referencia de qué significa hacerlo bien.** El contrato de diseño de HelpDesk todavía
no existe como código. Hasta que exista, la referencia es el de Impulsa:
`src/design-system/` —fundamentos, tema, recetas, componentes, patrones— y las vistas
`/clientes` y `/clientes/[clienteId]`. Si tu propuesta se aparta de cómo lo resuelven
esas vistas, la carga de la prueba es tuya.

**Permisos.** Ninguna condición de rol se escribe en el componente, la vista, el handler
ni el servicio. Se consulta el permiso técnico y su alcance efectivo mediante el
autorizador ejecutable. **Nada de comparar roles a mano**, ni siquiera para ocultar UI:
si el permiso no existe en el catálogo, se añade al catálogo y después se consume.
Ocultar en interfaz no sustituye la validación de servidor.

Ante duda en cualquiera de las dos: **inspecciona primero el contrato centralizado**.

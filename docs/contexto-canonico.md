# Contexto canónico de HelpDesk

```
ÁMBITO:  decisiones de producto, reglas de negocio y fronteras arquitectónicas ESTABLES
CORTE:   03-sep-2026
EXCLUYE: estado de implementación, evidencia, rutas, commits, próxima acción → handoff
         detalle funcional → especificación vigente de cada dominio
```

## Autoridad y precedencia

Ante una contradicción, prevalecen en este orden:

1. Decisión aprobada explícita
2. Especificación vigente del dominio correspondiente
3. Código y migraciones vigentes
4. Pruebas
5. Handoff fechado
6. Documentos históricos

> Las fuentes se nombran por **rol**, no por número de versión: "la especificación
> vigente de acceso", no "v0.2". Un documento que nombra versiones caduca en el
> siguiente corte.

## Propiedad documental

| Contenido | Documento propietario |
|---|---|
| Decisiones estables y fronteras | Este documento |
| Identidad interna y su relación con Conecta | `specs/acceso-empleados.md` |
| Identidad externa del portal de clientes | `specs/acceso-clientes.md` |
| Ciclo de vida del ticket, eventos y estados | `specs/tickets.md` |
| Convivencia con PowerApps y SharePoint | `specs/sincronizacion-sharepoint.md` |
| Gobierno de permisos ejecutables | `specs/permisos.md` |
| Patrones visuales y tokens | `design/sistema-helpdesk.md` |
| Estado real, evidencia y acción inmediata | `estado/handoff.md` |
| Cola ordenada de unidades de trabajo | `estado/plan-ejecucion.md` |
| Metodología general de ingeniería y diseño | Skills instaladas, no documentos |

Ningún documento repite contenido de otro: lo referencia.

## 1. Definición del producto

HelpDesk es la mesa de ayuda de la firma y un **módulo de la plataforma unificada**
(Next.js, TypeScript, Prisma, PostgreSQL), no una aplicación independiente. Convive con
Impulsa bajo Conecta, el punto de entrada corporativo.

- El **portal de clientes** es el canal externo: un cliente autorizado radica un
  requerimiento y sigue su estado. El equipo interno trabaja desde la plataforma.
- **PostgreSQL conserva el estado operativo y la trazabilidad.** SharePoint es sistema
  legacy en convivencia; no es fuente de verdad de nada nuevo.
- El portal minimiza fricción **sin sacrificar aislamiento** entre clientes y tickets.

### 1.1 Relación con Conecta

**Decisión aprobada el 03-sep-2026.** HelpDesk **es —o parece— parte de Conecta**: se
conserva su barra lateral, se cuelga de su URL (`/helpdesk` o equivalente) y la
experiencia debe leerse como una sección más, no como una aplicación distinta a la que
se salta.

> **Impulsa no es referencia en este punto y su ejemplo induce al error contrario.**
> Empezó como módulo de Conecta y creció hasta despegarse de esa idea; hoy es un
> proyecto propio al que Conecta solo redirige, y su enlace *Volver a Conecta* se
> retira. Un enlace de vuelta es precisamente lo que **no** debe existir aquí: lo
> necesita quien salió de un sitio, y HelpDesk no debe dar la sensación de que se salió
> de ninguna parte.

Lo que esto **no** cambia: la identidad sigue siendo propia. Parecer parte de Conecta es
una decisión de navegación y de interfaz, no de autenticación. Ningún token viaja entre
aplicaciones (`specs/acceso-empleados.md` §2), y la continuidad para el empleado se
consigue con el ingreso silencioso contra el mismo tenant, no compartiendo credenciales.

> `ABIERTO` **Mecanismo concreto de integración.** Si es *reverse proxy* bajo el dominio
> de Conecta, subdominio con shell replicado, u otra forma, depende de cómo esté montado
> Conecta —que este contrato no ha inspeccionado— y de qué admita su responsable. Afecta
> a cookies, rutas y despliegue, así que **se decide antes de construir el shell**.

### 1.2 Economía de recursos

**HelpDesk debe consumir lo mínimo posible de la VPS, sin degradar la experiencia de
clientes ni de empleados.** Es un criterio de diseño permanente, no una optimización
posterior, y aplica igual a lo que ya existe y a lo que se construya.

| Regla | Razón |
|---|---|
| Un proceso permanente nuevo exige justificación | Un worker inactivo consume memoria las 24 horas para trabajo que ocurre a ratos |
| Bajo demanda antes que sondeo | Sondear cada minuto algo que pasa tres veces al día es carga constante para trabajo intermitente |
| Agregar en SQL, no en memoria de la aplicación | La base tiene índices; el proceso de Node, no |
| Medir antes de dimensionar | Un valor elegido a ojo no es un argumento de eficiencia |

**La convivencia con SharePoint es carga temporal con fecha de caducidad.** La ingesta
incremental, el consumo de la cola de salida y sus workflows se apagan al retirar
PowerApps (§2). Es la mayor reducción de consumo prevista y llega sola al completar la
transición: no hay que optimizarla, hay que terminarla.

> **Cuidado con el falso ahorro.** Recortar consultas legítimas para que un tablero
> cargue «más barato» produce pantallas incompletas, y el usuario recarga: el mismo
> trabajo, dos veces, más una mala experiencia. La eficiencia se busca en el trabajo que
> nadie pidió —sondeos, procesos ociosos, datos traídos y descartados—, no en el que
> alguien está esperando.

### 1.3 Autorización destructiva y sus límites

**Decisión aprobada el 03-sep-2026.** El código, el diseño y los mecanismos de acceso
que hoy existen en `coraje-web/` **se eliminan y se rehacen**, no se refactorizan ni se
migran gradualmente. Se construyeron antes de que existieran las referencias de Impulsa
y antes de que el HelpDesk completo entrara en alcance, y varias piezas dejaron de
aplicar por completo.

Alcanzado por la autorización, sin necesidad de justificación adicional:

| Pieza | Por qué deja de aplicar |
|---|---|
| Selector abierto de cliente en `/portal` | No es autenticación. Sustituido por autorización individual (`specs/acceso-clientes.md`) |
| Clave compartida de `/redireccion` | Una contraseña que todos conocen no es un perímetro. Sustituida por identidad federada (`specs/acceso-empleados.md`) |
| Vistas, componentes y estilos existentes | **Rediseño visual completo**, no solo centralización de tokens (`design/sistema-helpdesk.md`) |
| Estructura de `src/features/*` vigente | Se rehace al ritmo de las unidades que la tocan |

**No alcanzado por la autorización.** Estas cuatro cosas son fuente de verdad viva y su
pérdida sería irrecuperable o visible para terceros:

1. **Los datos ya migrados** en `core` y `helpdesk`: 2.313 tickets y 439 eventos
   cargados y conciliados desde SharePoint. No son datos de prueba.
2. **Las listas de SharePoint**, que la aplicación de PowerApps consume en producción
   hoy, con personas trabajando sobre ellas.
3. **El pipeline de ingesta de n8n** y el SQL de `sql/`, que sostienen la convivencia.
4. **La evidencia empírica de `docs/legacy/`**: hallazgos, reglas de reclasificación y
   baseline conciliado. Es medición, no intención.

> La regla operativa que separa ambos conjuntos: **se puede destruir lo que se puede
> volver a escribir; no se destruye lo que habría que volver a medir, ni lo que otra
> persona está usando ahora mismo.**

## 2. Transición desde PowerApps

La sustitución es progresiva, por estrangulamiento, y ocurre en tres tiempos:

| Tiempo | Qué cambia | Estado |
|---|---|---|
| 1 | Los clientes radican en el portal web; el ticket viaja a PostgreSQL y de ahí a SharePoint, donde PowerApps lo ve como siempre | Construido, nunca usado por un cliente real |
| 2 | El equipo interno opera el HelpDesk completo desde la plataforma; PowerApps sigue disponible y ambos ven lo mismo | No construido |
| 3 | Se incentiva el uso de la plataforma, se apaga PowerApps y se desconectan las listas | No iniciado |

**Criterio para apagar PowerApps** — los cuatro, no tres de cuatro:

- La plataforma cubre creación, asignación, respuesta, cierre y rechazo.
- Los empleados la usan sin fricción medible.
- Existen métricas de estabilidad del período de convivencia.
- SharePoint ha dejado de ser fuente operativa principal.

Detalle del mecanismo en `specs/sincronizacion-sharepoint.md`.

## 3. Identidad y autorización

- **Empleados:** identidad federada contra el tenant corporativo de Entra ID. La
  aplicación valida el `id_token` y emite **su propia sesión**; no reenvía tokens del
  proveedor al navegador y no recibe tokens de otra aplicación.
- **Pertenecer al tenant no es pertenecer al HelpDesk.** El tenant es compartido por
  varias oficinas: la admisión la decide un registro en el directorio interno de
  personal, que funciona como lista de admitidos.
- **Clientes:** cada autorización vincula **un cliente, un correo y un alcance
  concreto**. Verificar identidad no concede acceso a lo que no se autorizó por
  separado.
- La autorización interna se define por **rol + acción** mediante un autorizador
  ejecutable. **Ninguna condición de rol se escribe a mano** en vistas, handlers ni
  servicios.
- **Toda autorización se revalida en servidor** antes de cada lectura o mutación
  relevante. Ocultar en interfaz no es autorizar.
- Una notificación, un enlace o una acción excepcional **no amplían la frontera** de
  clientes ni de tickets.

## 4. Esquema y migraciones — **decisión pendiente declarada**

Hoy el esquema se define en SQL escrito a mano (`sql/db/*.sql`), y
`prisma/schema.prisma` es el resultado de `prisma db pull` sobre él. Impulsa hace lo
contrario: el esquema se define en Prisma y las migraciones se versionan y se aplican
con `migrate deploy` en el despliegue.

Los dos modelos son defendibles y **son incompatibles entre sí**. Consecuencias reales
del modelo actual, no hipotéticas:

- No hay historial de cambios de esquema versionado en el repositorio.
- No hay forma automática de aplicar un cambio de esquema al desplegar.
- El SQL a mano permite constraints que Prisma no modela bien —`CHECK`,
  `UNIQUE NULLS NOT DISTINCT`, índices parciales— y el esquema **ya los usa**.

**Sin decidir.** Lo que no se admite es resolverlo a mitad de camino: adoptar
migraciones Prisma para las tablas nuevas dejando las viejas en SQL a mano produce dos
historias de esquema que divergen en silencio. La decisión se toma completa o no se
toma. Ver `estado/handoff.md`.

## 5. Fronteras de herramientas

- **PostgreSQL** es la fuente durable y donde se transforman los datos. Staging crudo,
  dimensiones, hechos, cola de salida y auditoría.
- **n8n orquesta, dispara y confirma. No transforma ni es fuente de verdad.** Un webhook
  que despierta un proceso no sustituye al registro que lo hizo elegible: si n8n está
  caído, el trabajo sigue pendiente y un cron de respaldo lo recoge.
- **La aplicación ejecuta y firma.** Las reglas de negocio —SLA, escalado, enrutamiento—
  viven en PostgreSQL y en la aplicación, nunca en el orquestador.
- **Prisma** es acceso a datos. Las transformaciones analíticas y de migración van en
  SQL.
- **El navegador envía decisiones, no estados.** El cliente pide una transición; el
  servidor decide si procede y cuál es el estado resultante.

## 6. Datos y trazabilidad

- **Todo cambio de estado de un ticket nace como evento.** No existe camino que cambie
  un estado sin escribir el hecho, y ambas escrituras ocurren en la misma transacción.
- El registro de eventos es **solo `INSERT`**. Corregir una decisión es un evento nuevo,
  nunca la mutación del anterior.
- **Un solo vocabulario de estados** para la vista interna y para el portal del cliente.
  Vocabularios paralelos son la forma en que dos vistas divergen sin que nadie lo note.
- Lo que separa lo que ve el cliente de lo que ve el equipo es un campo de
  **visibilidad** en el evento, no un segundo modelo de datos.
- **Un error recuperable no borra** progreso, selección ni contenido escrito por una
  persona.
- **No se fuerza clasificación.** Un ticket sin información suficiente queda sin
  clasificar antes que clasificado a la fuerza.

## 7. Operaciones durables

- El trabajo asíncrono que debe converger —sincronizar a SharePoint, enviar correo,
  escalar por SLA— se registra en PostgreSQL **antes** de intentarse, con clave de
  idempotencia derivada, no aleatoria.
- Los estados son `PENDING`, `PROCESSING`, terminal con éxito, fallo reintentable y
  fallo permanente. Un fallo permanente **no se reintenta**: abre atención humana.
- **Los reintentos automáticos son política operacional, no acciones humanas.** No
  forman parte del catálogo de permisos.
- Un reintento **nunca duplica** el efecto externo. La idempotencia se demuestra, no se
  supone.

## 8. Condiciones de producción

- No declarar listo para producción sin secretos productivos, limpieza de datos de
  prueba, smoke test controlado y **rollback ensayado**.
- La evidencia de un entorno no se extrapola a otro.
- La activación debe ser reversible y **fallar de forma explícita** cuando falte una
  dependencia, nunca degradarse en silencio.
- **Un cambio que puede alcanzar las listas de SharePoint puede alcanzar a personas que
  están trabajando en PowerApps.** Se trata con el cuidado de un cambio en producción,
  porque lo es.

---

**Changelog:** 03-sep-2026 — línea base. Incorpora el criterio de apagado de PowerApps
del retirado `estrategia_transicion.md` (§2) y la regla de no forzar clasificación del
retirado `decisiones_tecnicas.md` (§6); declara la autorización destructiva y sus
límites (§1.3) y la decisión pendiente sobre el modelo de esquema (§4); fija que HelpDesk
debe ser o parecer parte de Conecta, en dirección contraria a Impulsa, que se despegó de
esa idea (§1.1), y eleva la economía de recursos de la VPS a criterio permanente de
diseño (§1.2).

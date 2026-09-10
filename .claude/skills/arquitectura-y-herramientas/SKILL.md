---
name: arquitectura-y-herramientas
description: >-
  Diseño de sistema y uso correcto de cada herramienta. Úsala SIEMPRE que se diseñe
  o estructure un sistema, se elija stack/framework, se defina un flujo de datos o
  pipeline (ELT/ETL), se integren herramientas (n8n, PostgreSQL, Prisma, BI, BigQuery,
  Python, Apache…), o se tomen decisiones de escalabilidad, concurrencia,
  observabilidad o seguridad. Su eje es: cada herramienta en su rol óptimo, nunca
  haciendo el trabajo de otra. Aplica aunque el usuario no diga "arquitectura":
  preguntar "¿con qué hago X?" o "¿dónde proceso estos datos?" ya es el disparo.
---

# Arquitectura de sistema y uso correcto de herramientas

## Principio rector
Cada herramienta se usa para lo que hace mejor y **nunca** para lo que no le corresponde. Antes de proponer, pregunta: ¿es esta la herramienta correcta para este trabajo, o la estoy forzando? Forzar una herramienta fuera de su rol genera fragilidad, cuellos de botella y deuda.

## Fronteras de herramientas (extensible)
| Herramienta | Rol óptimo | NO usar para |
|---|---|---|
| **n8n** | Orquestación de flujos, automatización, disparadores, glue entre servicios | Procesamiento pesado de datos, transformaciones complejas |
| **PostgreSQL** | Almacenamiento y **procesamiento** de datos (SQL), staging, transformaciones ELT | Orquestación, lógica de aplicación |
| **Prisma** | Esquema, migraciones y acceso a datos de la app | Transformaciones analíticas pesadas (usa SQL/warehouse) |
| **Next.js** | App fullstack (UI + API routes / server actions / route handlers) | Backend muy complejo con mucha lógica de dominio |
| **NestJS** | Backend cuando la complejidad crece (DI, módulos, microservicios) | Proyectos simples (sobre-ingeniería) |
| **Astro** | Sitios mayormente estáticos, baja interacción | Apps con mucho estado/interactividad |
| **Python (pandas/polars)** | Análisis de datos, scripts, scraping (Selenium), notebooks | Servir tráfico web de alta concurrencia como servicio principal |
| **Power BI / Metabase** | Visualización y BI sobre datos ya procesados | Procesar o transformar datos |
| **BigQuery** | Warehouse analítico; transformar en el warehouse (ELT) | Arrastrar datasets crudos a la app para procesarlos ahí |

Amplía esta tabla cuando entren herramientas nuevas (Apache, etc.). Ante una que no esté aquí, define primero su rol antes de integrarla. El principio general por encima de la tabla: **ejecuta cada transformación en la capa que ofrezca mejor integridad, rendimiento, trazabilidad y mantenibilidad para ese proyecto**, y añade abstracciones, dependencias o infraestructura solo cuando resuelvan una necesidad demostrable.

## Patrón de datos por defecto: ELT
Carga los datos crudos → tablas **staging** → transforma **en el motor/warehouse** (SQL). No proceses en la capa de orquestación (n8n) ni en la app. Esto mantiene cada capa en su rol y hace el pipeline reproducible y auditable.

## Elección de framework por complejidad
`Astro` (casi estático) ↔ **`Next.js` (default fullstack)** ↔ `NestJS` (complejidad alta). Justifica cualquier salto: no sobre-ingenierices un CRUD con NestJS ni sub-dimensiones una app compleja quedándote en Next. Escala el tooling al riesgo real, no al gusto.

## Escalabilidad y concurrencia
**Define carga y crecimiento plausibles antes de dimensionar:** evita tanto subdimensionar como sobreingenierizar. Como referencia base, ~100 usuarios concurrentes es piso razonable, no techo ni objetivo fijo. Pregunta siempre: **¿qué se satura primero?** (conexiones, CPU, memoria, event loop, almacenamiento o proveedor externo).
- **Conexiones:** connection pooling; con serverless o muchas conexiones, PgBouncer delante de Postgres. Vigila el límite de conexiones de la DB.
- **No bloquear:** trabajo pesado fuera del request path → colas/workers, no bloquear el request ni el event loop.
- **Idempotencia:** handlers, webhooks (n8n) y pagos deben ser idempotentes (claves de idempotencia); asume reintentos.
- **Resiliencia:** timeouts, retries con backoff exponencial, circuit breakers, backpressure y rate limiting en las fronteras.
- **Estado:** servicios stateless para escalar horizontal; sesión/estado fuera del proceso (Redis/DB).
- **Datos:** índices para los accesos reales, evita N+1, paginación cursor-based.

## Observabilidad
Un pipeline que falla en silencio es el modo de fallo más caro: diseña para enterarte de que algo falló antes de que lo reporte un usuario.
- **Logging estructurado** (JSON) con niveles. Loguea en las fronteras —request in/out, llamadas externas, inicio/fin/fallo de jobs— con contexto (ids, duración), sin ruido.
- **Correlation ID** propagado a través de todo el flujo (n8n → API → worker → logs de DB) para reconstruir una ejecución de punta a punta.
- **Health checks:** liveness y readiness (incluyendo ping a la DB) en todo servicio.
- **n8n:** configura error workflows que notifiquen fallos de ejecución. Un workflow sin manejo de error es una falla silenciosa programada.
- **Métricas** (latencia, tasa de error, profundidad de cola) cuando el riesgo lo justifique; no instrumentes por decorar.

## Seguridad
- **Valida toda entrada en la frontera** con schemas (zod): body, query params, route params, payloads de webhooks. Lo no validado no entra al sistema.
- **Autenticación ≠ autorización:** cada route handler y server action verifica que el usuario puede hacer *esa* operación sobre *ese* recurso (ownership), no solo que está logueado. No delegues authz únicamente al middleware.
- **Nunca confíes en el cliente:** ni en IDs que envía, ni en campos ocultos, ni en precios o totales calculados en el front.
- **Webhooks** (n8n u otros): verifica firma o token. Un webhook abierto es un endpoint de escritura público.
- **Mínimo privilegio en DB:** la app no se conecta como superusuario; usuarios/roles por servicio.
- **Autorización excepcional:** cuando exista una acción de excepción (acceso organizacional, intervención administrativa), exige justificación explícita antes de ejecutarla y audita actor, recurso, permiso, justificación y resultado. Modela por separado los permisos de preparación, aprobación, envío, cancelación y reintento manual; los reintentos automáticos son política operacional, no acciones humanas.
- **Secretos:** solo por entorno (ver skill de reproducibilidad); jamás en código ni en logs.

## Modo adversarial al diseñar
Antes de cerrar un diseño: ¿dónde falla bajo carga? ¿qué acoplamientos innecesarios introduce? ¿qué herramienta está haciendo un trabajo que no le toca? ¿cuál es el punto único de fallo? ¿cómo me entero si falla? Explicita los trade-offs; no presentes una arquitectura como gratis.

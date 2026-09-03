# Sincronización con SharePoint y convivencia con PowerApps

```
ESTADO:      parcial asimétrico — la ingesta funciona y está ejercitada con datos
             reales; la salida está construida en la base pero su orquestación NO
             está en el repositorio y NUNCA se ejercitó
CORTE:       03-sep-2026
EVIDENCIA:   lectura directa de `sql/elt/06_transform_ticket.sql`,
             `sql/db/06_helpdesk_facts.sql`, `src/app/redireccion/[id]/actions.ts` y
             del contenido de `n8n/` en este corte. Los conteos de la carga vienen de
             `docs/legacy/baseline-calidad.md`
RIESGO:      §4 describe un defecto que hace inviable la fase 2 tal como está
```

**Autoridad:** este documento es propietario del contrato de convivencia con el sistema
legacy. El ciclo del ticket vive en `specs/tickets.md`; el criterio de apagado de
PowerApps, en `contexto-canonico.md` §2.

## 1. Por qué SharePoint sigue vivo

**Por una sola razón: la aplicación de PowerApps lo consume, y hay personas trabajando
en ella hoy.** No es fuente de verdad de nada nuevo, no aporta capacidades y no se
conserva por valor propio. Es el sustrato de la aplicación que se está sustituyendo, y
muere con ella.

## 2. Los dos caminos

No es un flujo bidireccional. Son **dos caminos unidireccionales independientes**, con
mecanismos distintos, madurez distinta y un punto de colisión que §4 desarrolla.

### 2.1 Entrada: SharePoint → PostgreSQL — `EJERCITADO`

`SharePoint → n8n → staging JSONB → transformación SQL → core/helpdesk`

- El payload crudo se conserva por `sp_id` en `staging.sp_*_raw`. Permite reprocesar sin
  volver a consultar la fuente y sin depender de nadie para reconstruir.
- La transformación ocurre **en PostgreSQL**, en `sql/elt/`. n8n transporta; no
  transforma.
- La identidad canónica se resuelve contra `helpdesk.ticket_legacy_sharepoint_ref`: si
  el `sp_id` ya tiene ticket, se reutiliza su `id_ticket`; si no, se genera uno nuevo.
  **La idempotencia no depende del identificador de SharePoint**, depende del mapa.
- Los eventos legacy se infieren de columnas, no de registros, así que se deduplican por
  `event_hash`.

Resultado conciliado en su momento: 2.313 tickets y 439 eventos, con las cuatro
excepciones de clasificación registradas en `docs/legacy/`.

### 2.2 Salida: PostgreSQL → SharePoint — `CONSTRUIDO, NUNCA EJERCITADO`

`app → helpdesk.ticket_sync_outbox → n8n → SharePoint`

El patrón está bien resuelto y **se conserva**:

- La intención de sincronizar se escribe **dentro de la misma transacción** que el
  cambio que la produce. Si la transacción falla, no queda intención huérfana.
- La idempotencia es estructural: `ON CONFLICT (id_ticket, operation) DO NOTHING` sobre
  un **índice parcial único** limitado a `PENDING` y `PROCESSING`. Dos intentos de
  encolar la misma operación no producen dos filas.
- El webhook a n8n se dispara **fuera de la transacción**, con timeout de 3 segundos, y
  **no puede hacer fallar la operación**: si n8n está caído, la fila ya está `PENDING` y
  un cron de respaldo debe recogerla. El webhook despierta; no es el mecanismo.
- El webhook lleva un secreto compartido en cabecera.

> **`RIESGO` El consumidor no está en el repositorio.** `n8n/` contiene un único
> archivo, el workflow de ingesta. **El workflow que consume el outbox no está
> versionado aquí.** O no existe, o vive solo en la instancia de n8n. En cualquiera de
> los dos casos, la mitad de salida del sistema no tiene fuente auditable, y el
> `CLAUDE.md` afirma que los workflows viven en esa carpeta.

## 3. Estado real del camino de salida

| Afirmación | Verdad |
|---|---|
| Un cliente ha radicado un ticket en el portal | **No.** Nunca ocurrió |
| El outbox tiene filas procesadas | Desconocido. Requiere consultar la base |
| Existe cron de respaldo en n8n | Desconocido. El código lo asume; nada lo demuestra |
| El workflow escribe la referencia legacy tras crear el ítem | **Desconocido, y es crítico** (§4.2) |

## 4. `RIESGO` El defecto que hace inviable la fase 2

### 4.1 SharePoint gana todos los conflictos, en todos los campos

`sql/elt/06_transform_ticket.sql` cierra con:

```sql
ON CONFLICT (id_ticket) DO UPDATE SET
    descripcion_problema = EXCLUDED.descripcion_problema,
    id_estado            = EXCLUDED.id_estado,
    id_prioridad         = EXCLUDED.id_prioridad,
    id_area_destino      = EXCLUDED.id_area_destino,
    id_tipo_req          = EXCLUDED.id_tipo_req,
    respuesta_final      = EXCLUDED.respuesta_final,
    calificacion         = EXCLUDED.calificacion,
    origen_sistema       = EXCLUDED.origen_sistema,
    ...
```

Y `origen_sistema` se proyecta como literal `'SHAREPOINT_LEGACY'`.

Dos consecuencias, ambas verificables leyendo esas líneas:

1. **Un ticket radicado en el portal pierde su procedencia** en la primera pasada de
   ingesta que lo alcance: `PORTAL_CLIENTE` se sobrescribe con `SHAREPOINT_LEGACY`. La
   única traza de que el portal existió desaparece del dato.
2. **Todo campo que la aplicación escriba será revertido** por la siguiente ingesta, a
   menos que SharePoint tenga exactamente el mismo valor. Hoy no importa, porque la
   aplicación casi no escribe. **En la fase 2, cuando el equipo interno trabaje desde la
   plataforma, importa en cada ticket y en cada campo.**

> **Esto no es un error de implementación: es la ausencia de una decisión.** El ELT se
> escribió para una migración *one-way*, y como migración *one-way* es correcto —los
> propios comentarios del SQL lo declaran así. Lo que falta es la regla de precedencia
> que la convivencia exige: **qué sistema manda sobre cada campo, y en qué fase.** Sin
> esa regla, la fase 2 consiste en dos sistemas pisándose.

Salidas conocidas, ninguna elegida: precedencia por campo · precedencia por marca de
tiempo de modificación · precedencia por origen del ticket · congelar la ingesta de los
tickets que la plataforma posee. La cuarta es la más simple y probablemente la
suficiente, pero exige saber **cuándo** un ticket pasa a ser propiedad de la plataforma.

### 4.2 Riesgo de duplicado por eco

Para que un ticket creado en el portal no vuelva de SharePoint como ticket nuevo, la
fila de `ticket_legacy_sharepoint_ref` que enlaza su `id_ticket` con el `sp_id` que
SharePoint le asignó **tiene que existir antes de la siguiente ingesta**. El único
momento en que ese `sp_id` se conoce es cuando el workflow de salida crea el ítem.

**Nada en el repositorio escribe esa fila desde el camino de salida.** El ELT la escribe
para lo que llega, no para lo que sale. Si el workflow no hace ese *callback*, el mapa
no encuentra el `sp_id`, genera un `id_ticket` nuevo e inserta **un segundo ticket** con
el mismo contenido.

> **`ABIERTO` — primera comprobación al retomar este frente.** Verificar en la instancia
> de n8n si el workflow de salida escribe la referencia legacy. Es la diferencia entre
> un camino de salida correcto y uno que duplica cada ticket la primera vez que se use
> de verdad. **No es una hipótesis a debatir: es una consulta a hacer.**

## 5. Invariantes de la convivencia

1. **PostgreSQL es la fuente durable.** SharePoint es un destino de compatibilidad
   mientras PowerApps viva.
2. **La transformación ocurre en la base.** n8n transporta, dispara y confirma.
3. **La intención se escribe en la transacción; el disparo, fuera.** Un orquestador
   caído retrasa, no pierde.
4. **La idempotencia es estructural**, sostenida por restricciones de la base, no por
   cuidado del llamador.
5. **El payload crudo se conserva.** Reprocesar no exige volver a la fuente.
6. **Un cambio en esta frontera puede alcanzar a personas trabajando en PowerApps.** Se
   trata como cambio en producción.

## 6. Criterios de aceptación

- Reprocesar la ingesta completa **no duplica** tickets ni eventos.
- Un ticket radicado en el portal **conserva su origen** después de cualquier pasada de
  ingesta.
- Un ticket que viaja a SharePoint y regresa **es el mismo ticket**, no dos.
- El outbox no acumula filas `PENDING` indefinidamente sin que nadie se entere.
- Un fallo del workflow de salida **no pierde** la intención de sincronizar.
- Existe **una regla escrita** de qué sistema manda sobre cada campo en cada fase.

## 7. Observabilidad mínima que no existe

Un pipeline que falla en silencio es el modo de fallo más caro, y este puede fallar en
silencio **hoy**:

| Falta | Consecuencia de no tenerlo |
|---|---|
| Alerta de filas `PENDING` envejecidas | La cola se detiene y nadie se entera hasta que un cliente pregunta |
| Workflow de error en n8n | Una ejecución fallida no notifica a nadie |
| Reconciliación de conteos SharePoint / PostgreSQL | Una divergencia se descubre por casualidad |
| Identificador de correlación de punta a punta | No se puede reconstruir el recorrido de un ticket entre los dos sistemas |

---

## 8. Verificación contra código

| # | Afirmación a verificar | Dónde comprobarlo | Veredicto |
|---|---|---|---|
| V1 | El ELT sobrescribe todos los campos con lo que trae SharePoint | `sql/elt/06_transform_ticket.sql` | **Verificado** 03-sep-2026 |
| V2 | `origen_sistema` se fuerza a `SHAREPOINT_LEGACY` | Ídem | **Verificado** 03-sep-2026 |
| V3 | La identidad se resuelve por `sp_id` contra la referencia legacy | Ídem, mapa temporal | **Verificado** 03-sep-2026 |
| V4 | El outbox es idempotente por índice parcial único | `sql/db/06_helpdesk_facts.sql`; `schema.prisma` | **Verificado** 03-sep-2026 |
| V5 | El webhook no puede hacer fallar la transacción | `src/app/redireccion/[id]/actions.ts` | **Verificado** 03-sep-2026 |
| V6 | El workflow de salida no está versionado | Contenido de `n8n/` | **Verificado** 03-sep-2026 |
| V7 | ¿El workflow de salida escribe la referencia legacy? | Instancia de n8n | **Sin verificar — crítico** (§4.2) |
| V8 | ¿Existe cron de respaldo del outbox? | Instancia de n8n | **Sin verificar** |
| V9 | Filas del outbox por estado y antigüedad | Consulta a `helpdesk.ticket_sync_outbox` | **Sin verificar** |
| V10 | ¿Hay workflow de error configurado? | Instancia de n8n | **Sin verificar** |

> **Lectura del conjunto.** Todo lo verificable en el repositorio está verificado, y el
> camino de entrada sale bien parado. **Las cuatro afirmaciones sin verificar están
> todas del lado de la salida y todas viven fuera del repositorio**, que es precisamente
> el motivo por el que el estado de ese camino no se conoce.

**Changelog:** 03-sep-2026 — línea base. Separa los dos caminos y su madurez asimétrica
(§2); registra que el workflow de salida no está versionado (§2.2); documenta la
precedencia incondicional de SharePoint sobre todos los campos y la pérdida de
procedencia (§4.1) y el riesgo de duplicado por eco (§4.2).

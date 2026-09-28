# Observabilidad: lo que puede fallar sin que nadie se entere

```
ESTADO:      CONSTRUIDA, SIN DESPLEGAR (U10, corte 21). Decisiones O1-O6 cerradas por el
             usuario el 28-sep-2026, con la condición de que Teams reciba «lo mínimo,
             solo lo más grave, inmediato y urgente»
CORTE:       28-sep-2026
EVIDENCIA:   `prisma validate`/`generate`, `tsc`, `eslint`, `pnpm test` 140/140; SQL y
             PL/pgSQL de la migración y del workflow parseados con `libpg-query`, con
             controles negativos. Sin ejercitar: ninguna función ha corrido contra la
             base, el workflow no está importado y nadie ha abierto `/salud`
BLOQUEO:     el guion de cierre (§7) exige desplegar los cortes 19-21 y encender el
             espejo con un ticket de prueba
```

**Autoridad:** este documento es propietario de qué se vigila, con qué umbral y quién
se entera. El inventario de señales (S1-S10) y las decisiones O1-O6 nacieron en
`estado/plan-ejecucion.md` (U10); los contratos vigilados viven en
`specs/sincronizacion-sharepoint.md`, `specs/tickets.md` y `specs/acceso-clientes.md`.

## 1. Qué problema resuelve

Lo que **falla ruidosamente** ya avisaba antes de U10: un workflow de n8n que falla
llama a «Alertas de errores a Teams» (V10, 24-sep-2026). U10 cubre lo que **falla en
silencio**, es decir, un estado que ningún error delata: un correo `FALLIDO` en una
tabla, un envío a PowerApps que nunca salió o un ítem de SharePoint que no llegó a
staging. Hasta U10 solo se descubrían abriendo el ticket o consultando la base a mano.

## 2. Diseño: la regla en la base, n8n solo dispara

Ningún proceso nuevo en la VPS (`CLAUDE.md`, economía de recursos).

| Pieza | Qué hace | Dónde |
|---|---|---|
| `helpdesk.salud_hallazgos()` | Una fila por chequeo que no está en verde. `SECURITY DEFINER`: lee `core`, `helpdesk` y `app` | Migración `20260928130000_observabilidad` |
| `helpdesk.registrar_revision_salud(items, origen)` | Suma la reconciliación con SharePoint (S9), guarda la revisión y decide si avisar. `SECURITY INVOKER`, porque toca `staging` y solo `coraje_etl` lo ve | Ídem |
| `helpdesk.revision_salud` | Una fila por revisión: hallazgos, críticos avisados y conteos de la reconciliación, también en verde | Ídem |
| `HELPDESK - Salud diaria V1` | 7:00 en Bogotá. Pide a SharePoint `Id` y `Created` de HelpDeskBd (una petición) y llama a la función. Solo si hay que avisar, se detiene con error y el workflow de error lo lleva a Teams | `n8n/` |
| `/salud` | Lo mismo que la revisión, para `ADMIN`. Aquí se marca revisada una divergencia (S4) | `src/app/salud/` |

**Por qué dos funciones:** `coraje_migrator`, dueño de las funciones, no ve `staging`
(`operacion.md`, F6), y `coraje_etl` no ve `app`, donde viven la autorización de correo
y la auditoría del portal. Cada función ve solo lo que le toca. La consecuencia: la
vista `/salud` calcula en vivo todo menos la reconciliación, que toma de la última
revisión diaria, con su fecha.

**Por qué la lista de ids y no `ItemCount`** (ajuste a la propuesta del plan): el total
dice «faltan 3»; los ids dicen cuáles. Sigue siendo una sola petición (≈3.000 ítems).
Si la lista llega a 5.000 ítems, el nodo falla en vez de reconciliar a medias: una
reconciliación incompleta diría que faltan ítems que sí están.

## 3. `DECISIÓN` (28-sep-2026) Chequeos, umbrales y severidad

Los umbrales viven **solo** en la función. Esta tabla es su explicación, y
`health-checks.contract.test.mts` exige que la base y `src/server/health/health-checks.ts`
declaren los mismos chequeos, con la misma señal y la misma severidad.

| Señal | Chequeo | Severidad | Umbral y por qué |
|---|---|---|---|
| S1 | `espejo_detenido` | **CRITICO** | Envío `PENDING` o `FAILED` (no por conflicto) de más de **2 h**, o `PROCESSING` de más de **1 h**. Solo lo encolado con el espejo encendido; un envío sustituido por otro posterior ya hecho no cuenta. Lo normal son segundos |
| S2 | `conflicto_sin_resolver` | ATENCION | `CONFLICTO_POWERAPPS` de más de **24 h**: la siguiente ingesta (≤ 12 h) lo resuelve sola, así que dos ingestas sin resolverlo significan que está atascado |
| S3 | `creacion_perdida` | **CRITICO** | Ticket de HelpDesk con envíos desde que se encendió el espejo, más de **2 h**, sin ítem y sin nada en la cola que lo explique (lo pendiente ya lo cuenta S1) |
| S4 | `divergencia_sin_revisar` | ATENCION | Cualquier `RECHAZADO` sin revisar. Sin umbral: deja de contar cuando alguien lo marca revisado en `/salud` |
| S5 | `correo_fallido` | ATENCION | `FALLIDO` de más de **12 h**: quien lo envió tuvo media jornada para reenviarlo |
| S5 | `correo_atascado` | ATENCION | `PENDIENTE`/`ENVIANDO` de más de **1 h**: el envío corre justo después de guardar |
| S6 | `autorizacion_revocada` | ATENCION | Persona activa con rol cuya autorización de correo revocó Microsoft (F14) |
| S6 | `sin_autorizacion` | AVISO | Persona activa con rol que no ha entrado desde U7. Es contexto, no un defecto; al principio la lista es larga |
| S7 | `envio_portal_fallido` | **CRITICO** | Cualquier `FALLO` de invitación o código en las últimas **24 h**. Con una revisión diaria, cada fallo cuenta una vez |
| S8 | `legacy_sin_inicio` | ATENCION | Ticket de PowerApps sin `CREACION`/`MIGRACION_LEGACY`, con 1 h de margen (la 06 y la 07 son sentencias distintas) |
| S8 | `proyeccion_desfasada` | ATENCION | Estado del ticket distinto del último evento que cambió estado (por `fecha_registro`). El escritor único lo hace imposible: si aparece, algo escribió por fuera |
| S8 | `legacy_sin_tipo` | AVISO | Ticket de PowerApps sin tipo reconocido (el baseline ya tenía 4) |
| S9 | `items_sin_ingerir` | **CRITICO** | Ítem de HelpDeskBd ausente de staging, creado antes de lo último que vio la ingesta (su cursor). Lo creado después es el retraso normal de hasta 12 h |
| S9 | `items_sin_ticket` | ATENCION | Ítem en staging sin ticket: la 06 lo descartó (sin solicitante ni cliente reconocido) |
| S9 | `items_borrados` | AVISO | Ítem en staging que ya no está en HelpDeskBd: alguien lo borró en PowerApps |
| S9 | `reconciliacion_sin_datos` | ATENCION | La revisión no recibió la lista de ítems |
| — | `revision_ausente` | ATENCION | La última revisión tiene más de 26 h, o nunca hubo una. Es lo único que delata que el aviso falta, y solo se ve en `/salud` |
| S10 | — | — | **Fuera de U10 (O5):** plazos vencidos son producto, no observabilidad |

### 3.1 Quién se entera: Teams, lo mínimo (O3)

Condición del usuario al aprobar: **el canal solo recibe lo más grave, inmediato y
urgente.** Por eso:

1. **Solo `CRITICO`.** Son cuatro chequeos: el espejo detenido (S1, S3), el portal sin
   poder enviar (S7) y la ingesta que pierde ítems (S9). En los cuatro, algo dejó de
   funcionar para personas que están trabajando y no se arregla solo.
2. **Solo cuando aparece o empeora.** Un crítico se avisa si su cantidad supera la de la
   revisión anterior. Si sigue igual, no se repite cada día; se sigue viendo en `/salud`.
3. **Un solo mensaje por revisión**, con todos los críticos abiertos y los nuevos
   marcados `[NUEVO]`, para que quien lo lea tenga el cuadro completo.
4. Sin críticos nuevos, **silencio**.

Viaja por el mismo camino que el aviso de la transformación 08: el workflow se detiene
con `Stop and Error` y «Alertas de errores a Teams» publica el mensaje. No hay endpoint
ni credencial nuevos. La tarjeta dice «Error en HELPDESK - Salud diaria V1», y el
mensaje empieza por «SALUD DIARIA DE HELPDESK, no error de ejecución».

**Riesgo aceptado:** un crítico que nadie atiende se avisa una sola vez. Si el aviso se
pierde, solo `/salud` lo sigue mostrando. Es el precio de un canal que no se llena, y
lo eligió el usuario.

**Quién atiende el canal:** Juan Felipe Zuluaga Mejía (`felipezuluaga@rbcol.co`),
decidido por el usuario el 28-sep-2026. Recibe el aviso y mira `/salud`; necesita el
rol `ADMIN` para ver la vista.

## 4. Divergencias: detectada, clasificada, corregida

`helpdesk.sync_divergencia` gana `revisada_at`, `revisada_por` y `motivo_revision`
(las tres juntas o ninguna). La única escritura es `helpdesk.marcar_divergencia_revisada`:
solo rechazadas, una sola vez, con motivo de 5 a 500 caracteres y por una persona
activa. La aplicación exige `salud.divergencia.revisar` antes de llamarla
(`permisos.md` §4.3).

De paso se cierra un defecto de U9: `ALTER DEFAULT PRIVILEGES` concede DML completo en
cada tabla nueva, así que `coraje_runtime` podía editar las divergencias pese al
comentario «nadie la edita». La migración le retira `INSERT`/`UPDATE`/`DELETE`, y a
`coraje_etl`, `UPDATE`/`DELETE`.

## 5. Registro estructurado y correlación

- `logEvent()` (`src/server/observability/log.ts`) escribe una línea JSON por evento en
  la salida del contenedor, la que ya guardan `docker logs` y Coolify.
- **Correlación sin identificador nuevo (O6):** `idTicket` en la línea es el `id_ticket`
  de la cola, de la referencia y de las divergencias, y el código del ticket es el
  `Id_Req` del ítem de HelpDeskBd. No se añade ninguna columna a la lista.
- **Sin secretos:** los campos con nombre de secreto (`token`, `secret`, `cookie`,
  `otp`, `cuerpo`, `html`, `enlace`…) se omiten, y los tokens reconocibles (Bearer,
  JWT, `?code=`) se borran del texto de los errores. Ninguna línea lleva cuerpos de
  correo, códigos ni enlaces. La entrada anónima del portal no registra el correo.
- `log.test.mts` falla si algún archivo de `src/` llama a `console.*` por fuera de
  `log.ts`.

## 6. Criterios de aceptación

1. Cada señal S1-S9 del inventario tiene al menos un chequeo (prueba de contrato).
2. Con todo en verde, la revisión no envía nada a Teams y guarda igualmente su fila con
   los conteos.
3. Un crítico nuevo avisa una vez; la revisión siguiente, sin cambios, no avisa.
4. Una divergencia marcada revisada deja de contar en S4 y muestra quién, cuándo y
   por qué, en `/salud` y en el detalle del ticket.
5. `coraje_runtime` no puede editar `sync_divergencia` ni ejecutar
   `registrar_revision_salud`.
6. Ninguna línea del registro lleva un secreto (prueba unitaria).

## 7. Guion de cierre (evidencia exigida por el plan)

1. Con el espejo encendido y un ticket de prueba, **provocar una divergencia
   controlada**: cambiar el área del ítem en PowerApps.
2. **Detectada:** la ingesta la registra `RECHAZADO`; en `/salud` aparece en S4.
3. **Clasificada:** marcarla revisada con el motivo.
4. **Corregida:** deshacer el cambio en PowerApps; la revisión siguiente (manual en n8n)
   no lista nada en S9 y guarda sus conteos.
5. Registrar en el handoff las consultas y sus resultados, antes y después:
   `SELECT * FROM helpdesk.salud_hallazgos();` y
   `SELECT ejecutada_at, hallazgos, criticos_nuevos, items_sharepoint, items_staging,
   items_con_ticket FROM helpdesk.revision_salud ORDER BY ejecutada_at DESC LIMIT 2;`.

Además, antes del guion: **una revisión en verde** para medir la línea base de cada
chequeo contra la base real. Los umbrales se eligieron sin medir, y un chequeo que sale
en rojo el primer día por datos históricos, como `proyeccion_desfasada` si la historia
legacy tiene fechas desordenadas, se corrige o se reclasifica antes de confiar en él.

## 8. Verificación contra código

| # | Afirmación a verificar | Dónde comprobarlo | Veredicto (28-sep-2026) |
|---|---|---|---|
| V1 | Base y aplicación declaran los mismos chequeos y cubren S1-S9 | `health-checks.contract.test.mts` | **Verificado por prueba** |
| V2 | A Teams solo llega lo crítico, nuevo o peor | Ídem, sobre `registrar_revision_salud` | **Verificado por prueba** (texto); sin ejercitar |
| V3 | La vista no tiene consultas propias sobre lo vigilado | `health-queries.ts` lee `salud_hallazgos()` | **Por inspección**. La lista de divergencias pendientes sí se lee aparte, porque la vista necesita cada fila para marcarla |
| V4 | `coraje_runtime` no edita divergencias | `REVOKE` en la migración; prueba de contrato | **Verificado por prueba** (texto); sin prueba negativa contra la base |
| V5 | Ningún `console.*` fuera de `logEvent` | `log.test.mts` | **Verificado por prueba** |
| V6 | El workflow corre a las 7:00 de Bogotá | `settings.timezone` y cron del JSON | **Verificado por prueba** sobre la copia; sin importar |
| V7 | Los chequeos encuentran lo que deben con datos reales | Guion de §7 | **Sin ejercitar** |

**Changelog:**
- 28-sep-2026 — línea base (U10, corte 21). Decisiones O1-O6 cerradas; ajustes a la
  propuesta aprobados por el usuario (S1 solo con espejo encendido y sin sustituidos;
  S5 a 12 h y atascados a 1 h; S6 separado en revocada y sin autorización; S9 por lista
  de ids; registro de cada revisión); Teams reducido a lo crítico nuevo o peor.

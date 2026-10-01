# Plan de ejecución

```
ESTADO:  cola de trabajo vigente
CORTE:   03-sep-2026
```

**Qué es este documento:** la **cola ordenada de unidades de trabajo** pendientes, cada
una con objetivo, escenarios mínimos, evidencia requerida y condición de cierre
verificable. No contiene estado del corte (`estado/handoff.md`), decisiones estables
(`contexto-canonico.md`), contratos funcionales (`specs/`) ni metodología de cambio
seguro (skill `ciclo-de-trabajo`).

**Relación con el handoff:** el handoff posee la **acción inmediata**; este documento
posee el **orden**. La acción inmediata debe ser la cabeza de esta cola, o declarar
explícitamente que se desvía y por qué.

## Objetivo y fronteras

Construir el HelpDesk sobre la base de datos que ya existe, sustituyendo por completo la
capa de aplicación, **sin romper la convivencia con PowerApps** mientras dure.

- Priorizar **decisiones y mediciones** sobre construcción: casi toda la cola está
  bloqueada por cosas que no se saben, no por cosas que no se han escrito.
- Distinguir solución estructural, mitigación temporal y deuda aceptada.
- Mantener PostgreSQL como fuente durable.
- **No construir tablas nuevas antes de decidir el modelo de esquema.** Cambiar de
  convención a mitad produce dos historias que divergen.

---

## Cola de unidades

### ~~U1 · Mediciones y verificaciones~~ — cerrada 10-sep-2026, ya no es cabeza de la cola

Las cinco preguntas quedaron respondidas y registradas en `estado/handoff.md` §4, con
evidencia real contra la VPS y contra `n8n/`. Al cerrarla apareció F10 (buzón
compartido, `core.dim_personal`), resuelto y ejercitado contra la base real como
trabajo previo a U2 — documentado como "acción inmediata" en el handoff, no como
entrada nueva de esta cola. **U2 pasa a ser la cabeza.**

**Objetivo:** convertir en hechos las cinco incógnitas que hoy bloquean decisiones. No
se construye nada; se consulta y se registra.

| # | Pregunta | Dónde se responde | Qué desbloquea |
|---|---|---|---|
| 1 | ¿Cuántas filas de `core.dim_personal` tienen correo corporativo y están activas? | Consulta a la base | Alcance del alta de directorio (`acceso-empleados.md` §7.1) |
| 2 | ¿El workflow de salida escribe la referencia legacy tras crear el ítem? | Instancia de n8n | Si el camino de salida duplica tickets (`sincronizacion-sharepoint.md` §4.2) |
| 3 | ¿Existe cron de respaldo del outbox y workflow de error? | Instancia de n8n | Si la cola puede detenerse en silencio |
| 4 | ¿Qué estados y prioridades usan realmente los 2.313 tickets migrados? | Consulta agrupada | El vocabulario real frente al catálogo de tres estados |
| 5 | ¿Cuántas filas hay en el outbox y en qué estado? | Consulta a la base | Si quedó trabajo colgado |

**Evidencia requerida:** el resultado de cada consulta, con fecha y contra qué base.
Para las de n8n, captura o exportación del workflow, no una impresión.

**Cierre:** las cinco respondidas y registradas en el handoff. **Ninguna se responde por
inferencia.**

### U0 · Levantamiento funcional de PowerApps — *en paralelo, latencia humana*

**Objetivo:** documentar qué hace realmente la mesa de ayuda hoy: transiciones, quién
las ejecuta, qué pasa cuando se espera al cliente, cómo se cierra, qué significan
`respuesta_final` y `calificacion`, y qué roles existen de verdad.

**Va en paralelo a U1 y no después**, porque su cuello de botella no es trabajo sino
disponibilidad de otras personas y acceso a la aplicación. Empezarlo tarde retrasa todo
lo demás.

**Cierre:** un documento que permita ratificar `specs/tickets.md` §4 y
`specs/permisos.md` §6 sin inventar nada.

> **Sin U0, el diseño del ciclo del ticket es diseño por analogía**, y las reglas reales
> aparecen cuando los empleados se nieguen a migrar.

### ~~U2 · Construir el baseline de migraciones Prisma~~ — cerrada 11-sep-2026, ya no es cabeza de la cola

Los cuatro escenarios mínimos quedaron construidos y **ejercitados contra producción**,
no solo declarados: baseline adoptado (`prisma migrate resolve --applied`,
`applied_steps_count = 0`) · credenciales separadas en `coraje_migrator`/
`coraje_runtime`/`coraje_etl`, con `coraje_app` retirado de todo uso automático ·
servicio `migrate` desplegado de verdad en Coolify, gate `depends_on:
service_completed_successfully` confirmado en logs reales (`No pending migrations to
apply.` antes de que `web` arrancara) · una escritura real desde el portal
(creación de ticket) confirmó `coraje_runtime` en producción, no solo por `GRANT`
verificado. Detalle completo y evidencia en `estado/handoff.md` (cortes 6-8). **U3
pasa a ser la cabeza.**

**Objetivo:** ya no es decidir — `contexto-canonico.md` §4 registra la decisión tomada
(migraciones Prisma completas, se abandona SQL a mano). U2 es **construir** sobre esa
decisión, no volver a discutirla.

**Escenarios mínimos:** aplicar D1' ya resuelta (`PascalCase`+`@@map` a `snake_case`,
igual que Impulsa) mapeando cada tabla y columna de las tres schemas · generar el
baseline (`prisma migrate resolve --applied`) sobre la base viva sin recrear el esquema
existente · fijar la disciplina
para que `CHECK`, `UNIQUE NULLS NOT DISTINCT` e índices parciales sobrevivan a
`migrate dev`/`diff` sin que alguien sin contexto los borre · separar credenciales de
migración y de runtime (cierra `F6`) · construir el servicio `migrate` de un disparo en
el compose, gateando el arranque de `web` como en Impulsa.

**Cierre:** baseline aplicado y verificado contra la base real (2.313 tickets, 439
eventos intactos) · servicio `migrate` funcionando en un despliegue real · credenciales
separadas · decisión D1' registrada. **Bloquea toda unidad que cree tablas, y bloquea
además que "commit + push" sea un método de verificación real** (sin el servicio
`migrate`, no hay ciclo local y tampoco hay gate de despliegue — ver riesgo en
`estado/handoff.md` §6).

### ~~U3 · Identidad de empleados~~ — cerrada 22-sep-2026, ya no es cabeza de la cola

**Objetivo:** implementar `specs/acceso-empleados.md` completo: OIDC con PKCE, validación
del `id_token`, admisión contra directorio, sesión propia opaca y revocable.

**Escenarios mínimos:** ingreso de persona admitida · rechazo por cada una de las cuatro
causas, **con prueba negativa** · desactivación que surte efecto en la siguiente
navegación · cookie manipulada que no concede acceso · destino de retorno preservado y
saneado.

**Depende de:** U1 §1, U2.

**Cierre real (22-sep-2026):** seis de los ocho escenarios **ejercitados contra el
despliegue** en `https://conecta.rbgct.cloud/helpdesk` — evidencia detallada en
`estado/handoff.md` §4. Los dos restantes, `NOT_REGISTERED` y `EMAIL_INVALID`, quedan
con **cobertura unitaria únicamente**: reproducirlos exige una cuenta del tenant ausente
del directorio o un `id_token` sin correo válido, y ninguna de las dos se puede fabricar
contra Entra ID. Se cierra la unidad reconociendo esa limitación, no declarándolos
ejercitados.

### ~~U4 · Perímetro y retiro de la clave compartida~~ — cerrada 22-sep-2026, ya no es cabeza de la cola

**Objetivo:** *deny-by-default* en el proxy, lista pública explícita, y **eliminación**
de `REDIRECCION_PASSWORD` y su ruta de acceso.

**Cierre:** una prueba enumera las páginas de `src/app` y exige que cada una fuera de los
prefijos públicos resuelva identidad. `grep` de `REDIRECCION_PASSWORD` sin resultados.

**Cierre real (22-sep-2026):** las dos condiciones cumplidas y verificadas. `src/proxy.ts`
deniega por defecto con la lista pública en `public-paths.ts` —separada para que la
prueba verifique la misma regla que el proxy aplica, no una copia—; 42 pruebas, de las
que ocho ejecutan `proxy()` sobre peticiones reales y seis enumeran `src/app`. El `grep`
de la clave dejó de ser manual: una prueba falla si el nombre reaparece. Cuatro
escenarios ejercitados contra `https://conecta.rbgct.cloud/helpdesk`. Publicado en
`735be57` y `1937589`. **U5 pasa a ser la cabeza.**

**Dos cosas se decidieron dentro de la unidad, y no eran obvias de antemano:**

- **El portal de clientes se retiró, no se declaró público.** `plan-ejecucion.md` no
  decía qué hacer con él y `acceso-empleados.md` §8 lo daba por excepción prevista.
  Decisión del usuario, con la constancia de que ningún cliente lo usa: era una
  superficie anónima en dominio público que listaba clientes con identificación fiscal
  y creaba tickets sin credencial, y la identidad que iba a protegerla (`U8`) no tiene
  fecha. Consecuencia registrada: **HelpDesk no tiene hoy canal externo**.
- **El ingreso sin sesión entra por `/api/auth/microsoft/start`, no por `/login`.**
  Mandar a la pantalla con botón a quien ya trae sesión viva de Entra contradice el
  requisito de fricción de `acceso-empleados.md` §4. `/login` queda como destino de lo
  que no es navegación de documento, y como fallback cuando el silencioso se rechaza.

> **Trabajo adicional, fuera del objetivo de U4 y pedido por el usuario en la misma
> sesión (`1937589`): se retiró el frontend heredado completo** — las dos vistas de
> redirección, el `AppShell` con su paleta escrita en la vista, las tablas, el
> formulario, `features/tickets/` (ya código muerto), los tokens de `globals.css` y las
> fuentes de plantilla del layout. No se sustituyó nada por nada: los valores visuales
> son competencia de U5. Quedan cinco rutas: `/`, `/login` y las tres de autenticación.
> La lógica de redirección se conservó sin pantalla en `features/redireccion/`, por ser
> el único sitio donde están escritas enteras la resolución del encargado y la forma
> del registro del outbox.

### ~~U5 · Contrato de diseño ejecutable y primera vista~~ — cerrada 24-sep-2026, ya no es cabeza de la cola

**Cierre real (24-sep-2026):** las dos condiciones cumplidas y verificadas. El barrido de
`design-system/contract.test.mts` recorre todo `src/` con diez detectores, y el
validador falla ante divergencia entre adaptadores, demostrado forzándola a mano. Los
dos modos de entrada y el shell de Conecta los ejercitó el usuario en producción.
Publicado en `463f8d0`, `d145679`, `47886bd` y `ed0bd1d`. **U6 pasa a ser la cabeza.**

**Lo que la unidad decidió y no estaba escrito, por decisión del usuario:**

- **Diseño propio.** De Impulsa se toma solo lo conceptual; de Conecta, solo el shell.
  La marca la fija el Manual de Marca Corporativa.
- **Dos modos de entrada** (`specs/integracion-conecta.md`, nueva). Desde Conecta se
  entra sin clics y dentro de su shell; directo, eligiendo cuenta y con barra propia.
- **El acceso a HelpDesk en Conecta irá en la vista «Auto gestión»**, no en su menú.
  Se construye cuando HelpDesk esté listo.


**Objetivo:** fundamentos, tema, validador de coherencia entre los dos adaptadores, y la
primera vista nueva construida **consumiendo el contrato desde el inicio**.

**Cierre:** la vista no contiene un solo valor visual local, y el validador falla si los
dos adaptadores divergen.

**Punto de partida cambiado el 22-sep-2026:** no hay frontend que desmontar ni que
convivir. `/` y `/login` se dibujan sin estilo, `globals.css` no declara un solo valor y
el layout raíz no impone tipografía. U5 empieza en blanco, que es la condición que
`design/sistema-helpdesk.md` §1 daba por necesaria al descartar una fase de
centralización posterior. Sigue pendiente **D5** (acento visual propio o compartido con
Impulsa), y sigue pendiente replicar el shell de Conecta dentro de HelpDesk, incluido el
enlace de vuelta desde el sidebar de Conecta como `<a href>` y no como `navigate()` de
su router.

### U5.2 · Endpoint de Conecta: parte 2 de la integración — *en paralelo, latencia humana*

**Objetivo:** construir la parte 2 de la opción 3 (`specs/integracion-conecta.md` §1.1,
§5), decidida por el usuario el 24-sep-2026. Es un endpoint de solo lectura en el
backend Django de Conecta, que da a HelpDesk el dato oficial del empleado y si tiene
«Formación», más su cliente en HelpDesk.

**Condición no negociable:** **todos** los controles de seguridad de §5.1:
- credencial propia que no entrega un SuperAdmin;
- alcance comprobado en código;
- respuesta mínima, solo empleados activos;
- cupo y registro propios;
- clave en cabecera, rotable y fuera del repositorio;
- tiempo de espera ≤ 2 s con fallo cerrado;
- cotejo exacto por correo;
- no reutilizar las API keys actuales ni la clase antigua duplicada.

**Procedimiento:** toca RBGCT-REACT, así que rige `integracion-conecta.md` §1.2. El diff
concreto se presenta al usuario antes de escribirlo, va solo en `lulox`, y llevarlo a
`main` es trabajo del equipo de Conecta.

**Por qué en paralelo y no en la cabeza:** su cuello de botella es humano (la aprobación
y el despliegue de otro equipo), igual que U0. No bloquea U6 ni la bloquea U6.

**Cierre:** el endpoint desplegado en Conecta con cada control de §5.1 verificado. HelpDesk
muestra «Formación» a quien tiene cursos y no a quien no los tiene. Con Conecta caído,
HelpDesk entra igual.

### U6 · Modelo de eventos del ticket — **cerrada**

> **CERRADA el 25-sep-2026.** Fases 1 y 2 desplegadas y ejercitadas: prueba negativa
> superada e ingesta posterior al retiro de privilegios en *Success*. **U7 pasa a ser
> la cabeza.** Decisiones: Transiciones (cuatro
> estados, sin `ESPERANDO_SOLICITANTE`), reloj por turno, escritor único en PostgreSQL,
> traducción de estados legacy, visibilidad, actor (`EMPLEADO` / `SISTEMA`), catálogo de
> tipos de evento como `enum` y registro protegido por privilegios están en
> `specs/tickets.md` (§3.1, §4, §4.1, §4.2, §5, §6). **No queda ninguna decisión
> pendiente.** Orden de construcción y de
> despliegue: `estado/handoff.md`, «Acción inmediata».

**Objetivo:** los tres campos ausentes (`specs/tickets.md` §6), el escritor único y la
proyección transaccional.

**Escenarios mínimos:** ningún camino cambia estado sin evento, **con prueba negativa** ·
historia de estados reconstruible · evento interno invisible en el portal, con prueba
negativa · reprocesar la ingesta legacy no duplica eventos.

**Depende de:** U0, U2.

### U7 · Ciclo interno del ticket — **ejercitada y aprobada, salvo adjuntos**

> **30-sep-2026, aprobación del usuario:** las pruebas B (ciclo con correos, negativa
> del `INSERT`, calendario de 2026) quedan aprobadas. Evidencia en `estado/handoff.md`
> («Acción inmediata», B: pasos 3, 4 y 6 del 29-sep; correos del ciclo del 30-sep,
> corte 26). Lo único abierto de U7 son los **adjuntos**, que van inmediatamente
> después de U15.

Crear, bandeja, reasignar, responder (que cierra) y rechazar, más la nota interna,
cada acción conectada al autorizador. Plazo por días hábiles, sin pausa. Correo como
quien actúa (D6) y adjuntos. **Depende de:** U6, `specs/permisos.md`.

> **Corregido el 25-sep-2026.** Este texto decía «reapertura» y «reloj de SLA con
> pausa». En la v1 no hay ninguna de las dos (`specs/tickets.md` §4.1, §5), y manda la
> spec. Redirigir (T3) sale de U7: solo lo producen los tickets de clientes, y pasa a U8.
>
> **Decisiones del 25-sep-2026:** U7 se prueba solo con tickets creados en HelpDesk y
> no se usa de verdad hasta U9. Los tickets legacy se consultan, no se operan. El correo
> lleva un enlace al ticket, no adjuntos. Sin worker para los correos: se envían tras el
> commit y se reenvían a mano. Los adjuntos siguen el modelo del buzón de sugerencias de
> Impulsa.
>
> **Estado (corte 18):** todo construido salvo los adjuntos, sin desplegar. Los
> adjuntos esperan los permisos de Graph y el destino de almacenamiento
> (`estado/handoff.md`, «Acción inmediata»).
>
> **Cierre:** el ciclo completo ejercitado con tickets de prueba en el despliegue, con
> sus correos enviados; prueba negativa del `INSERT` directo; calendario de 2026
> verificado contra los festivos oficiales; adjuntos construidos y ejercitados.

> **Estado (corte 19, 28-sep-2026):** desplegada (`migrate`: 8 migraciones, ninguna
> pendiente). Sus pruebas —negativa del `INSERT`, calendario, ciclo en el navegador,
> salida de n8n— se hacen junto con las de U8 (`estado/handoff.md`, «Acción
> inmediata»). Los adjuntos siguen bloqueados.

### U8 · Acceso de clientes — **desplegada el 28-sep-2026 (corte 19), sin ejercitar**

Implementa `specs/acceso-clientes.md` y retira `/portal` actual. Incluye redirigir
(T3), que solo producen los tickets de clientes, con su permiso y el rol que lo tenga.
**Depende de:** la decisión de alcance de su §3.1, la del remitente de correo de su §11,
y U3.

> **Se adelantó a las pruebas de U7 el 28-sep-2026**, por decisión del usuario: ese día
> no había SSH, así que se construyó todo lo que no exige la VPS, y las dos unidades se
> ejercitan juntas. Decisiones tomadas ese día: D2, D3, D4 y los roles `CLASIFICADOR` y
> `ADMIN` (`specs/acceso-clientes.md`, `specs/permisos.md` §4.2).
>
> **Cierre:** la migración aplicada; una invitación enviada y activada; un código pedido
> y verificado desde otro navegador; un ticket radicado, clasificado y respondido, con
> sus correos; la prueba negativa de D2 (otro contacto no ve el ticket), de solo
> lectura y de revocación; y la auditoría sin secretos. El guion está en
> `estado/handoff.md`, «Acción inmediata», pasos 7 a 16.
>
> **No abrir el portal a clientes reales** antes de desplegar U9 **y** de decidir si se
> enciende el espejo: sin espejo, lo que radiquen los clientes solo se ve en HelpDesk.

### U9 · Regla de precedencia con SharePoint — **desplegada el 28-sep-2026 (corte 20), sin ejercitar**

> **Decidida y construida el 28-sep-2026** (corte 20). Un dueño por ticket: lo que nace
> en PowerApps es de SharePoint y se consulta en HelpDesk hasta el corte; lo que nace en
> HelpDesk es de HelpDesk y se refleja en HelpDeskBd. Los cambios hechos en PowerApps
> se aceptan si son válidos, con su evento, o se rechazan con aviso. Espejo apagado por
> defecto. Regla completa en `specs/sincronizacion-sharepoint.md` §4.3. El guion de
> despliegue y de pruebas está en `estado/handoff.md`, «Acción inmediata».

**Objetivo:** cerrar el defecto de `sincronizacion-sharepoint.md` §4.1 antes de que el
equipo interno trabaje desde la plataforma.

**Cierre:** una regla escrita de qué sistema manda sobre cada campo y en qué fase, y el
ELT ajustado a ella. Un ticket del portal conserva su origen tras una pasada de ingesta.

> **Se vuelve urgente en el momento en que empiece U7**, no antes. Pero U7 sin esto
> produce trabajo que la siguiente ingesta borra.

### U10 · Observabilidad — **desplegada el 28-sep-2026 (corte 21), sin ejercitar**

> **Construida sobre el diseño de abajo**, con las decisiones O1-O6 cerradas y los
> ajustes aprobados por el usuario. El contrato vigente es `specs/observabilidad.md`;
> esta sección queda como la preparación. **Sin cerrar:** el guion de cierre exige
> ejercitarla (`estado/handoff.md`, «Acción inmediata»).

Alerta de outbox envejecido · workflow de error en n8n · reconciliación de conteos ·
identificador de correlación de punta a punta · logs estructurados sin secretos.

**Condición de cierre:** una divergencia controlada debe ser **detectada, clasificada y
corregida**, dejando evidencia del antes, la acción y el resultado. **Un tablero sin
reconciliación no cierra la unidad.**

**Depende de:** U8 y U9 **desplegadas**, porque sus tablas son las que se vigilan. Se
puede construir antes, pero ejercitarla exige el despliegue.

#### Qué ya existe y no hay que rehacer

- **Workflow de error de n8n** (`n8n/Alertas de errores a Teams.json`, V10 cerrado el
  24-sep-2026). Lo usan la ingesta, la salida y el correo del portal. Una ejecución
  que falla ya avisa en Teams.
- **Aviso de divergencias rechazadas** (U9): la transformación 08 de la ingesta.
- **Registros que ya guardan el fallo**, pero que hoy solo se ven al abrir un ticket o
  consultando la base: los que lista la tabla de abajo.

#### Inventario: lo que hoy puede fallar sin que nadie se entere

| # | Señal | Dónde está | Desde | Por qué importa |
|---|---|---|---|---|
| S1 | Filas del outbox `PENDING` envejecidas, o `FAILED` con 5 intentos | `helpdesk.ticket_sync_outbox` | U9 | El espejo se detuvo: PowerApps deja de ver lo que pasa en HelpDesk |
| S2 | `CONFLICTO_POWERAPPS` sin conciliar tras más de una ingesta | Ídem, `last_error` | U9 | Un ticket quedó desincronizado y esperando |
| S3 | Tickets de HelpDesk clasificados, con el espejo encendido y sin ítem (sin fila en `ticket_legacy_sharepoint_ref`) pasado un plazo | `fact_ticket` + ref | U9 | La creación en SharePoint nunca ocurrió |
| S4 | Divergencias `RECHAZADO` sin revisar | `helpdesk.sync_divergencia` | U9 | Hoy la tabla no tiene cómo marcar «revisado»: el aviso de Teams sale una vez y se pierde |
| S5 | Correos del ticket `FALLIDO` o atascados en `PENDIENTE`/`ENVIANDO` | `helpdesk.ticket_notificacion` | U7 | Solo se ven en el detalle del ticket, y solo los reenvía quien los envió |
| S6 | Agentes activos con la autorización de correo revocada | `app.employee_graph_grant.revoked_at` | U7 | Todos sus correos fallan hasta que vuelvan a entrar (F14) |
| S7 | Envíos de invitación o de código fallidos | `app.portal_auditoria` (`INVITACION_ENVIADA` / `CODIGO_ENVIADO` con `FALLO`) | U8 | Ningún cliente nuevo entra: la credencial del buzón pudo caducar |
| S8 | Salud de la ingesta: tickets legacy sin evento de inicio, estados desfasados, tipos sin mapear | `fact_ticket_evento`, `staging.helpdesk_legacy_tipo_req_unmapped` | U6 | Hoy se comprueba a mano en cada despliegue |
| S9 | **Reconciliación de conteos**: ítems de HelpDeskBd frente a tickets con referencia, e ítems en staging sin ticket | SharePoint + staging + ref | — | Es lo que exige el cierre: sin esto, una divergencia se descubre por casualidad |
| S10 | Tickets por vencer o vencidos sin movimiento | `fact_ticket.fecha_limite` | U7 | Fuera del alcance mínimo; se decide si entra (`specs/tickets.md` §5 lo prevé con un scheduler) |

#### Diseño propuesto (a confirmar al empezar la unidad)

Respeta la economía de recursos de `CLAUDE.md`: **ningún proceso nuevo en la VPS**.

1. **La regla vive en la base.** Una función `helpdesk.revisar_salud()` devuelve una
   fila por chequeo que no está en verde: código (`S1`…), severidad, cantidad, detalle
   y un id de ejemplo. Con índices sobre lo que filtra. Una prueba de contrato cruza
   esta tabla con la función, para que ninguna señal quede sin chequeo.
2. **n8n solo dispara y avisa.** Un workflow `HELPDESK - Salud diaria`, programado una
   vez al día, llama a la función. Para S9 pide a SharePoint el conteo de HelpDeskBd
   (`ItemCount` de la lista, una sola petición) y lo pasa a la base, que es quien
   compara. Solo envía algo a Teams si hay filas, reutilizando el canal del workflow de
   error. Sin filas, silencio.
3. **S4 gana una columna** `revisada_at` (y quién la revisó) en `sync_divergencia`, para
   que una divergencia deje de avisar cuando alguien la atendió. Es el «clasificada y
   corregida» del cierre.
4. **Correlación:** el `id_ticket` ya recorre la cola, la referencia y las divergencias,
   y el ítem de SharePoint lleva `Id_Req = codigo_ticket`. Lo que falta es que los
   registros del servidor lo lleven siempre, en el mismo formato.
5. **Registros estructurados sin secretos:** un ayudante `logEvent()` en
   `src/server/` que escribe una línea JSON (evento, `id_ticket`, resultado, sin
   cuerpos de correo ni tokens) en lugar de `console.*` sueltos, y una prueba que
   impida registrar valores de campos con nombres de secreto.
6. **Opcional, según tu decisión:** una vista `/salud` para `ADMIN` que muestre lo mismo
   que la función, sin consultas propias.

#### Decisiones (cerradas por el usuario el 28-sep-2026)

| # | Decisión | Propuesta | Resolución |
|---|---|---|---|
| O1 | Frecuencia de la revisión | Una vez al día, 7:00 en Bogotá, además del aviso inmediato que ya dan los workflows cuando fallan | **Aprobada**, y cada revisión se guarda en la base para ver si faltó alguna |
| O2 | Umbrales de cada señal | S1 `PENDING` > 2 h con el espejo encendido; S2 > 24 h; S3 > 2 h; S5 cualquier `FALLIDO` de más de 1 día; S7 cualquier `FALLO` del último día | **Aprobada con ajustes:** S1 solo lo encolado con el espejo encendido, más reintentos agotados y `PROCESSING` > 1 h; S3 solo lo que S1 no cubre; S4 sin umbral hasta que se revise; S5 `FALLIDO` > 12 h y atascados > 1 h; S6 revocada, con aparte quien nunca autorizó; S9 por lista de ids (`specs/observabilidad.md` §3) |
| O3 | Quién recibe y atiende las alertas | El mismo canal de Teams del workflow de error | **Aprobada, con condición:** al canal solo llega lo crítico, y solo cuando aparece o empeora («lo mínimo, solo lo más grave, inmediato y urgente»). **Lo atiende Juan Felipe Zuluaga Mejía** (`felipezuluaga@rbcol.co`) |
| O4 | ¿Página `/salud` en HelpDesk para `ADMIN`, o solo Teams? | Solo Teams primero; la página, si hace falta | **Página incluida**, con `salud.consultar` y `salud.divergencia.revisar` |
| O5 | ¿Entra S10 (plazos vencidos)? | No en U10: es producto, no observabilidad | **Aprobada:** fuera |
| O6 | ¿Añadir una columna `id_ticket` a la lista HelpDeskBd para la correlación? | **No**: la lista es infraestructura compartida con PowerApps en producción, y `Id_Req` ya correlaciona | **Aprobada:** sin columna |

#### Guion de cierre (evidencia exigida)

1. Con el espejo encendido y un ticket de prueba, **provocar una divergencia
   controlada**: cambiar el área del ítem en PowerApps.
2. **Detectada:** la ingesta la registra `RECHAZADO` y la revisión diaria la lista.
3. **Clasificada:** alguien la marca revisada, con el motivo.
4. **Corregida:** se deshace el cambio en PowerApps, y la reconciliación de conteos de
   la siguiente revisión queda en verde.
5. Registrar en el handoff el antes, la acción y el después, con las consultas y sus
   resultados.

### U11 · Seguimiento del ticket (prototipo de TI) — **desplegada el 29-sep-2026 (corte 22), sin ejercitar**

**Objetivo:** construir lo que el prototipo `helpdesk_santi/` de la persona encargada
de TI trae y es compatible con las decisiones vigentes, para que lo corrija usándolo
y no leyendo una spec. Decisión del usuario del 28-sep-2026: «que solo sea correr
pruebas y corregir, no implementar nada nuevo».

**Construido** (`specs/tickets.md` §11.1, `specs/permisos.md` §4.4): observadores,
solicitud de validación, comentario del solicitante, y en la bandeja la vista «Que
sigo», búsqueda, filtro por estado y contadores con vencidos.

**Fuera, a propósito, hasta hablarlo con TI:** estado «En Proceso», cierre por el
solicitante, «Crear tarea» y «Agregar solución», prioridad y tipo elegidos por el
solicitante, «SLA cumplido» como cerrados entre total, respuesta del validador. La
propuesta del usuario es resolverlos tomando lo del prototipo; se decide después de
probar. Los adjuntos siguen bloqueados en U7.

**Condición de cierre:** la persona de TI prueba el flujo en el despliegue (`estado/
handoff.md`, «Acción inmediata», G) y sus correcciones quedan decididas: construidas o
descartadas con motivo.

### U12 · Suplantación para pruebas — **desplegada y habilitada el 30-sep-2026 (corte 23), bloque temporal**

**Objetivo:** ejercitar U7-U11 sin una cuenta por persona. Decisión del usuario del
29-sep-2026: selector de empleado como el de Impulsa, sin acotar a un área, en
producción porque HelpDesk no tiene otro entorno. No es una unidad de producto: se
retira antes de que HelpDesk sea la herramienta de trabajo de cualquier área
(`estado/operacion.md`, «Suplantación para pruebas»).

**Condición de cierre:** habilitada por psql, un cambio de persona y el regreso quedan
en `app.suplantacion_auditoria`, y un correo generado suplantando llega solo a quien
suplanta.

### U13 · Rol `COLABORADOR` y visibilidad por recepción — **cerrada el 30-sep-2026 (corte 24), ejercitada suplantando**

**Objetivo:** que cada empleado vea solo lo suyo y que ver un área lo decida el
enrutamiento, no un rol (`specs/permisos.md` §4.5). `AGENTE` pasa a `COLABORADOR` y
`ADMIN` consulta todos los tickets.

**Condición de cierre:** en el despliegue, suplantando, un `COLABORADOR` que no recibe
nada ve solo lo suyo; el encargado de recepción de un área ve toda esa área; quien
recibe por tipo ve solo esos tipos; `ADMIN` ve todas las áreas.

### U15 · Centro de notificaciones — **ejercitada y cerrada el 01-oct-2026** (pendiente que se cierra al reasignar y al responder, novedad sin el comentario interno, campana que cuenta lo abierto, escalamiento enviado una sola vez desde el buzón)

**Objetivo:** que los empleados reciban los avisos del ticket en una campana y no por
correo, con «Requiere tu atención» abierta hasta actuar y escalamiento por correo de lo
que se queda sin atender (`specs/tickets.md` §12). Decisiones del usuario del 30-sep:
solo escalamiento por correo a empleados; la clasificación de §12.2; más de un día
hábil; desde el buzón de automatización.

**Condición de cierre:** en el despliegue, suplantando, un ticket creado deja un
pendiente en la campana de quien lo recibe; reasignarlo lo cierra y abre otro al nuevo
responsable; responder cierra todo; quien radicó ve la novedad sin el comentario
interno; y una ejecución manual del escalamiento con un pendiente viejo envía un correo,
una segunda no repite.

**Siguiente en la cola:** los adjuntos de U7, inmediatamente después.

### U16 · Color por área — **cerrada el 01-oct-2026** (corte 34; el usuario la probó suplantando a una persona por área: «funciona, es sutil y se ve bien»)

**Objetivo:** que la interfaz tome el color del área de quien entra y que cada ticket
muestre el color de su área (`design/sistema-helpdesk.md` §5.1). Decisión del usuario.

**Condición de cierre:** suplantando a una persona de cada área (Revisoría, Contabilidad,
BPO, Legal, Administración), el acento, el avatar y el número de la campana toman su
color; «Asignado» se ve igual en todas; la columna «Área y tipo» lleva el punto del área
del ticket.

### U17 · Modo Coraje — **desplegada el 01-oct-2026 (corte 35); color corregido en el corte 36, sin desplegar**

Coraje (el trabajo con clientes) como **modo** de la misma aplicación, al estilo de
claro/oscuro, no como pestaña ni aplicación aparte, y que en esencia cambie poco para
que el paso de uno a otro se lea como una transición suave. Decisiones del usuario: en
modo Coraje cambian los tickets que se listan (los de clientes), aparecen sus secciones
y la interfaz cambia de color con el mismo acento del área; el interruptor lo ve
quien tiene tickets de clientes a su alcance o puede redirigir o administrar accesos
(por permiso, no por rol). Condiciones de diseño: el modo no esconde trabajo (la
campana es global, el interruptor lleva el número del otro modo, un enlace a un ticket
abre su modo); la estructura de la bandeja y del detalle es la misma. El mismo día:
`CLASIFICADOR` pasa a `REDIRECTOR` y la sección «Clasificación», a la vista «Por
redirigir» de la bandeja de Coraje. Construido: `specs/tickets.md` §13,
`specs/permisos.md` §4.7, `design/sistema-helpdesk.md` §5.2. Corregido el mismo día
tras verlo desplegado: el lienzo y las tarjetas en navy no convencieron al usuario; en
Coraje pasan a navy solo la barra superior y las pestañas, y el contenido sigue claro.

**Condición de cierre:** con el rol `REDIRECTOR`, Juan Felipe redirige desde «Por
redirigir» un ticket radicado en el portal; quien lo recibe lo ve en su «Por atender»
de Coraje, y el interruptor de HelpDesk le muestra el número; un enlace al ticket desde
la campana lo abre en modo Coraje; alguien sin tickets de clientes no ve el interruptor.

### U18 · Dominio de clientes — **código construido el 01-oct-2026 (corte 37), sin desplegar; falta el DNS y Coolify**

El portal de clientes sale del origen de Conecta a `soporte.rbgct.cloud` (decisión del
usuario, «de momento»). Dos razones: un cliente no sabe qué es Conecta, y compartir
origen con la intranet le da al portal externo el mismo almacenamiento del navegador
que los empleados. **Los empleados se quedan en `conecta.rbgct.cloud/helpdesk`:** la
entrada sin clics lee `gct_empleado` del `localStorage` de Conecta, que solo existe en
su origen (`contexto-canonico.md` §1.1). Hace falta: el subdominio y su certificado
(quien administre `rbgct.cloud`), el dominio en Coolify, una URL pública aparte para los
correos del portal, la cookie del portal limitada a ese dominio, el perímetro rechazando
allí las rutas de empleados y decidir si se quita `/helpdesk` de sus rutas. **Condición
que la vuelve urgente:** invitar a un cliente real.

Construido: `PORTAL_PUBLIC_ORIGIN` activa el dominio (sin ella, todo sigue como antes);
en él solo existe el portal, y en Conecta el portal redirige allí con la misma ruta; los
correos del portal llevan su dominio; la raíz lleva a `/helpdesk/portal`. `/helpdesk`
se queda en las rutas: quitarlo exigiría reescrituras en Traefik. Pasos de
infraestructura en `operacion.md`, «Dominio del portal de clientes (U18)».

**Condición de cierre:** con la variable activa, una invitación nueva llega con enlace
a `soporte.rbgct.cloud`, el contacto entra y radica allí, `/helpdesk/tickets` responde
404 en ese dominio y el portal en Conecta redirige.

---

## Riesgos y controles

| Riesgo | Control |
|---|---|
| Construir el ciclo del ticket por analogía | U0 antes de ratificar estados y roles |
| Crear tablas con una convención que luego cambia | U2 bloquea toda unidad que cree tablas |
| Dos formas de entrar durante la transición | U4 inmediatamente después de U3, no «más adelante» |
| El equipo trabaja y la ingesta le borra el trabajo | U9 antes de que U7 esté en uso real |
| Duplicar tickets al usar el camino de salida | U1 §2 antes de que un cliente radique |
| Destruir datos reales bajo la autorización destructiva | `contexto-canonico.md` §1.3 delimita qué queda fuera |
| Reintroducir valores visuales locales | U5 antes de construir vistas, no después |
| Documentación que envejece sin que nadie lo note | Tablas *Verificación contra código*, resueltas una spec por sesión |

## Método por unidad

El protocolo de cambio seguro, el criterio de finalización, la clasificación de
evidencia y la disciplina Git viven en la skill `ciclo-de-trabajo`. Específico de este
plan: **una sola unidad inmediata a la vez**, con su puerta de salida registrada. U0 es
la única excepción declarada, por tener latencia humana en lugar de trabajo. **No
convertir recomendaciones futuras en una lista implícita de tareas.**

**Changelog:**
- 03-sep-2026 — línea base. La cola se ordena por bloqueo, no por valor percibido: las
  dos primeras unidades no construyen nada porque casi todo lo demás está bloqueado por
  hechos que no se conocen.
- 03-sep-2026 (mismo día) — U2 deja de ser "decidir el modelo de esquema" y pasa a ser
  "construir el baseline de migraciones Prisma": la decisión ya se tomó
  (`contexto-canonico.md` §4, D1). Añade D1' (convención de nombres) como escenario
  mínimo nuevo, sin resolver.
- 03-sep-2026 (mismo día) — D1' resuelta: `PascalCase`+`@@map` a `snake_case`, igual que
  Impulsa. El escenario mínimo de U2 pasa de "decidir" a "aplicar" ese mapeo sobre las
  tres schemas.
- 10-sep-2026 — U1 cierra (evidencia completa en `estado/handoff.md` §4). El hallazgo
  de F10 que dejó (`core.dim_personal` con buzón compartido duplicado) se resuelve y se
  ejercita contra la base real como trabajo previo a U2, fuera de esta cola —
  documentado en el handoff, no aquí. **U2 pasa a ser la cabeza de la cola.**
- 11-sep-2026 — U2 cierra, con los cuatro escenarios mínimos ejercitados contra
  producción, no solo construidos: baseline adoptado, credenciales separadas
  (`coraje_migrator`/`coraje_runtime`/`coraje_etl`, `coraje_app` retirado de todo uso
  automático) y el servicio `migrate` desplegado de verdad, con su gate confirmado en
  un deploy real de Coolify. Evidencia completa en `estado/handoff.md` (cortes 6-8).
  **U3 pasa a ser la cabeza de la cola.**
- 24-sep-2026 — U5 cierra: contrato de diseño ejecutable, shell de Conecta y dos modos
  de entrada, con el shell y los modos ejercitados en producción por el usuario.
  Evidencia en `estado/handoff.md` (corte 14). Entra en la cola U5.2 (endpoint de Conecta, parte 2 de la
  opción 3, decidida y en paralelo por su latencia humana). El panel de administración
  propio queda como posibilidad no comprometida. **U6 pasa a ser la cabeza de la cola.**
- 28-sep-2026 — U10 construida (corte 21), sin desplegar: decisiones O1-O6 cerradas,
  con Teams limitado a lo crítico nuevo o peor por condición del usuario. Sale junto
  con los cortes 19 y 20. **La cabeza de la cola sigue siendo desplegar y ejercitar
  U7-U10** (pruebas A-E y guion de cierre de U10).
- 28-sep-2026 — los cortes 19, 20 y 21 se publican y despliegan juntos (U8, U9 y
  U10). U11 construida (corte 22), sin desplegar: lo compatible del prototipo de TI.
  En el mismo corte se corrige el 500 del perímetro para quien llega sin sesión.
  **La cabeza de la cola sigue siendo ejercitar U7-U11** (pruebas B-G del handoff).
- 29-sep-2026 — corte 22 desplegado. U12 construida (corte 23): suplantación para
  pruebas, bloque temporal con condición de retiro. **La cabeza de la cola sigue siendo
  ejercitar U7-U11**; U12 es el medio para hacerlo.
- 30-sep-2026 — U12 desplegada y habilitada. U13 construida (corte 24): `COLABORADOR`
  y visibilidad por recepción, antes de ejercitar U7 para no probar dos veces la
  bandeja. **La cabeza de la cola sigue siendo ejercitar U7-U11.**
- 30-sep-2026 — U13 desplegada. U14 construida (corte 25): ajustes de bandeja y
  shell pedidos por el usuario, entre ellos «Nuevo ticket» como ventana emergente.
  No es una unidad de la cola: son correcciones de uso antes de las pruebas.
- 30-sep-2026 — el usuario da por aprobadas las pruebas B de U7. Orden decidido:
  **U15 (centro de notificaciones) es la cabeza; los adjuntos de U7 van justo
  después.**
- 30-sep-2026 — U15 construida (corte 28): avisos en la campana, cierre de pendientes
  en la base y escalamiento diario sin proceso nuevo. **Cabeza de la cola: desplegar y
  ejercitar U15; después, los adjuntos de U7.**
- 01-oct-2026 — cabeceras conciliadas con el changelog y el handoff: U8 y U9 estaban
  desplegadas desde el 28-sep (cortes 19-21) aunque su cabecera decía «sin desplegar»;
  U12 desplegada y habilitada; U13 cerrada (handoff, corte 26); U15 desplegada. Manda el
  registro fechado de cada despliegue, no la cabecera que no se actualizó.
- 01-oct-2026 — U16 construida (corte 34): color por área. U17 (modo Coraje)
  decidida. **Cabeza de la cola: ejercitar U8 (portal) y U16; después U17 y los adjuntos.**
- 01-oct-2026 — U16 cerrada con la prueba del usuario. U17 construida (corte 35): modo
  Coraje, rol `REDIRECTOR` y vista «Por redirigir». **Cabeza de la cola: desplegar y
  ejercitar U17 junto con el portal (U8); después, los adjuntos de U7.**
- 01-oct-2026 — U17 desplegada (corte 35); el color de Coraje se corrige a barra y
  pestañas en navy (corte 36). U18 (dominio de clientes, `soporte.rbgct.cloud`)
  decidida. **Cabeza de la cola: ejercitar U17 con el portal (U8); después, los
  adjuntos de U7; U18 antes de invitar a un cliente real.**
- 01-oct-2026 — U18 construida en código (corte 37): dominio propio del portal,
  activado por variable. **Pendiente: DNS y Coolify (operacion.md).**

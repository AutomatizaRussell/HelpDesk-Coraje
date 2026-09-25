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

### U6 · Modelo de eventos del ticket — **cabeza de la cola, en curso**

> **Estado al 25-sep-2026: fase 1 desplegada y ejercitada** (modelo, escritor único,
> ingesta reescrita); **fase 2 construida** (retiro de privilegios), falta la prueba
> negativa contra la base para cerrar. Decisiones: Transiciones (cuatro
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

### U7 · Ciclo interno del ticket

Bandeja, asignación, respuesta, cierre, rechazo y reapertura, cada acción conectada al
autorizador. Reloj de SLA con pausa. **Depende de:** U6, `specs/permisos.md`.

### U8 · Acceso de clientes

Implementa `specs/acceso-clientes.md` y retira `/portal` actual. **Depende de:** la
decisión de alcance de su §3.1, la del remitente de correo de su §11, y U3.

### U9 · Regla de precedencia con SharePoint

**Objetivo:** cerrar el defecto de `sincronizacion-sharepoint.md` §4.1 antes de que el
equipo interno trabaje desde la plataforma.

**Cierre:** una regla escrita de qué sistema manda sobre cada campo y en qué fase, y el
ELT ajustado a ella. Un ticket del portal conserva su origen tras una pasada de ingesta.

> **Se vuelve urgente en el momento en que empiece U7**, no antes. Pero U7 sin esto
> produce trabajo que la siguiente ingesta borra.

### U10 · Observabilidad

Alerta de outbox envejecido · workflow de error en n8n · reconciliación de conteos ·
identificador de correlación de punta a punta · logs estructurados sin secretos.

**Condición de cierre:** una divergencia controlada debe ser **detectada, clasificada y
corregida**, dejando evidencia del antes, la acción y el resultado. **Un tablero sin
reconciliación no cierra la unidad.**

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

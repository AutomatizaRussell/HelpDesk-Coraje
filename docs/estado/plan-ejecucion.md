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

### U2 · Construir el baseline de migraciones Prisma — **cabeza de la cola**

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

### U3 · Identidad de empleados

**Objetivo:** implementar `specs/acceso-empleados.md` completo: OIDC con PKCE, validación
del `id_token`, admisión contra directorio, sesión propia opaca y revocable.

**Escenarios mínimos:** ingreso de persona admitida · rechazo por cada una de las cuatro
causas, **con prueba negativa** · desactivación que surte efecto en la siguiente
navegación · cookie manipulada que no concede acceso · destino de retorno preservado y
saneado.

**Depende de:** U1 §1, U2.

### U4 · Perímetro y retiro de la clave compartida

**Objetivo:** *deny-by-default* en el proxy, lista pública explícita, y **eliminación**
de `REDIRECCION_PASSWORD` y su ruta de acceso.

**Cierre:** una prueba enumera las páginas de `src/app` y exige que cada una fuera de los
prefijos públicos resuelva identidad. `grep` de `REDIRECCION_PASSWORD` sin resultados.

> **No es opcional ni posterior a U3.** Mientras la clave viva, hay dos formas de entrar
> y la más débil no deja rastro de quién entró.

### U5 · Contrato de diseño ejecutable y primera vista

**Objetivo:** fundamentos, tema, validador de coherencia entre los dos adaptadores, y la
primera vista nueva construida **consumiendo el contrato desde el inicio**.

**Cierre:** la vista no contiene un solo valor visual local, y el validador falla si los
dos adaptadores divergen.

### U6 · Modelo de eventos del ticket

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

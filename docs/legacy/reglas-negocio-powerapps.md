# Reglas de Negocio Observadas en PowerApps

Evidencia extraída del código fuente Power Fx (`.pa.yaml`, exportado del `.msapp`) de la
app PowerApps que HelpDesk sustituye. **No es referencia de implementación**: Power Fx
es reactivo, evaluado en cliente, sin transacciones — estructuralmente incompatible con
App Router + Prisma + PostgreSQL. Lo que se conserva aquí es la regla de negocio que ese
código codifica, para decidir explícitamente cuál se traslada, cuál se corrige y cuál se
descarta. Del diseño visual de PowerApps no se toma nada.

Fuente: `Src/*.pa.yaml` y `References/DataSources.json` de la carpeta exportada del
`.msapp` (9 pantallas, ~14.200 líneas). No se reproduce código; se cita como máximo una
línea de fórmula cuando es indispensable.

## 0. Alerta de seguridad activa (fuera del alcance de esta migración, acción inmediata)

`Indicadores.pa.yaml` embebe una URL de Power BI "publicar en la Web"
(`app.powerbi.com/view?r=...`). Ese mecanismo da acceso público al reporte sin Entra ID
ni licencia, indefinidamente, sin registro de uso. Equivale en la práctica a una
credencial filtrada. **Acción recomendada, independiente de HelpDesk:** revocar/regenerar
la publicación en Power BI. En el reemplazo, no usar "publish to web" — Power BI
Embedded con autenticación y row-level security, o el indicador dentro de la propia app
contra PostgreSQL.

## 1. Modelo de datos observado (listas SharePoint reales)

Todas cuelgan de un sitio **personal** (OneDrive/MySite) de un empleado
(`.../personal/edwinpena_rbcol_co`), no de un sitio de equipo — riesgo de continuidad si
esa cuenta se desactiva, ajeno a esta migración pero relevante como antecedente de por
qué HelpDesk debe vivir en infraestructura propia.

| Lista | Rol | Columnas clave (nombre interno → visible) |
|---|---|---|
| `HelpDeskBd` | Ticket (entidad central) | `Id_Req`, `OData__x00c1_rea_Remite`→Área_Remite, `OData__x00c1_rea_Destino`→Área_Destino, `Tipo_Requerimiento`, `Categor_x00ed_a1`→Categoría1, `Categor_x00ed_a2`→Categoría2, `Recibe`, `AsignadoA`, `Prioridad`, `Justifique_Prioridad`, `Requerimiento`, `Respuesta_Sugerida`, `Respuesta`, `Comentarios_adicionales`, `Observaci_x00f3_n`→Observación, `Calificaci_x00f3_n`→Calificación, `Fecha_Solicitud`/`Hora_Solicitud`, `Fecha_Max_Respuesta`, `Fecha_Asignaci_x00f3_n`/`Hora_Asignacion`, `Fecha_Respuesta`/`Hora_Respuesta`, `Estado`, `Reasignado`, `Cliente`, `Nit`, adjuntos |
| `TipoReqHD` | Catálogo tipo/categoría por área | `Title`(=área), `Tipo_Requerimiento`, `Categor_x00ed_a1`, `Categor_x00ed_a2` — ya documentado en `hallazgos-migracion.md` |
| `RecibeHelpdesk` | Enrutamiento área → responsable | `Title`, `Area`, `Recibe` (correo) |
| `Días_Habiles` | Calendario laboral para SLA | `Title`(fecha texto), `# Habil`(secuencial), `Fecha` |
| `Clientes Contai` | Maestro de clientes / acceso portal | `Cliente`, `TIPOCLIENTE`, `Grupo económico`, `Area`, `Estado`, **`Contrasena`, `CodigoAcceso` (string plano, sin hash)**, `Reporte` |
| `Personal GCT` | Roster RR.HH. + matriz de permisos | `Title`=**cédula**, `NOMBRE`, `CORREO`, `AREA`, `CARGO`, `Estado`(choice), y ~20 columnas booleanas de permisos por módulo (`Autoriza_Cheques`, `EditarAdmin`, `ApruebaVacaciones`, `ModuloImpuestos`, etc.) |
| `TareasLegal` | Tracker externo ("oportunidapp"), ajeno al dominio HelpDesk | `Id_Helpdesk`/`Helpdesk` (enlace al ticket), ~50 columnas propias de gestión de tareas legales |

**Dos hallazgos de diseño con implicación de seguridad, no urgentes pero para el nuevo
esquema:**
- `Clientes Contai.Contrasena`/`CodigoAcceso` en texto plano confirma, en el propio
  legacy, el mismo patrón temporal que `docs/specs/acceso-clientes.md` ya declara a
  reemplazar — no es información nueva, es evidencia que lo corrobora.
- `Personal GCT` es "permisos por columna booleana en fila de usuario": el antecedente
  exacto de lo que el contrato de permisos de HelpDesk (autorizador ejecutable, catálogo
  de permisos técnicos) debe reemplazar. No portar ese modelo.

## 2. Máquina de estados del ticket

Campo `Estado`: **texto libre, no choice tipado**. Tres valores literales observados,
sin estado intermedio "en proceso" ni posterior a calificar:

- `Abierto` — creado, sin asignar.
- `Reasignado` — derivado a otra persona del área.
- `Cerrado` — resuelto.

Transiciones, ambas producidas desde la pantalla `Asignar` (y su variante `HdLegal`, ver
§7) mediante un único dropdown binario SI/NO:

```
Abierto ──(Reasignado=SI, elige destino)──▶ Reasignado
Abierto ──(Reasignado=NO, escribe Respuesta)──▶ Cerrado
```

`Responder` (pantalla separada) solo actúa sobre tickets en `Reasignado` y siempre
produce `Reasignado → Cerrado`. **No existe reversa** (Cerrado/Reasignado → Abierto) en
ninguna pantalla. Calificar **no** cambia `Estado`: el ticket permanece `Cerrado` con o
sin calificación — calificar es opcional de facto, pese a que el badge de navegación lo
muestre como pendiente.

## 3. Generación de identificador

Fórmula (`Nuevo_1.pa.yaml`):

```
=Left(DataCardValue14.Text,3)&"-"&First(Split(GUID(),"-")).Value
```

Prefijo = 3 primeras letras del área **destino** + guion + primer grupo hex de un GUID.
**Sin verificación de unicidad** contra los IDs existentes — se confía en la entropía del
GUID. **Colisión de prefijo conocida:** `ADMINISTRACIÓN` y `ADMINISTRACIÓN-RECEPCIÓN`
producen ambas `ADM-`.

## 4. SLA / prioridad

Cálculo en **días hábiles** contra la tabla `Días_Habiles`, no días calendario:

| Prioridad (texto literal) | Días hábiles sumados |
|---|---|
| `Alta (1 día)` | +1 |
| `Media (3 días)` | +3 |
| `Baja (5 días)` | +5 |

Si la fecha de solicitud no está en `Días_Habiles`: reserva `Today()+3` calendario.

**Inconsistencia:** la fórmula contempla `Alta (1 día)`, pero el dropdown de creación
(`Nuevo_1`) solo ofrece `Media`/`Baja` — la rama de 1 día es alcanzable, si acaso, desde
otra pantalla no confirmada. No asumir que "Alta" es una prioridad viva sin verificarlo
contra datos reales migrados.

**Reasignar no reinicia el SLA:** `Fecha_Max_Respuesta` se preserva del ticket original
en la pantalla `Asignar`; solo se estampan nuevos `Fecha_Asignación`/`Hora_Asignacion`.

## 5. Reglas de creación

- Campos condicionalmente requeridos según `Tipo_Requerimiento` (p. ej. `Cliente` y
  `Respuesta_Sugerida` solo si el tipo es de asesoría — literal `IMPUESTOS  ASESORATE`
  con doble espacio, ya señalado en `hallazgos-migracion.md`).
- Adjunto: extensión validada (`pdf`/`jpg` únicamente), **el límite de 5 MB es solo
  texto de ayuda, no hay validación de tamaño en la fórmula**.
- Doble umbral inconsistente para `Respuesta_Sugerida` en tickets de asesoría: un
  mensaje de error exige mínimo 50 caracteres, el bloqueo real del botón exige 70.
- Área **remitente** se autocompleta desde el perfil del empleado (no elegible); área
  **destino** es de elección libre entre 7 valores fijos, sin restricción de rol.
- Responsable (`Recibe`) sale de `RecibeHelpdesk` por área, **salvo una excepción
  hardcodeada**: `Tipo_Requerimiento = "PROYECTOS Y TI"` → correo fijo en la fórmula, no
  en la tabla de enrutamiento.
- Único efecto secundario: correo directo (`Office365Outlook.SendEmailV2`) al
  responsable — sin cola, sin reintento, sin registro de fallo de envío.

## 6. Reglas de asignación/reasignación

- Bandeja de trabajo: solo ve para asignar los tickets donde `Recibe = correo del
  usuario actual`. Esto —no un rol declarado— es el mecanismo de permiso implícito de
  toda la app: quien recibe el ticket es quien puede actuar sobre él.
- Destino de reasignación restringido al **área del usuario que asigna**
  (`Filter(Personal, AREA = área_del_usuario)`), sin verificación de que el destino esté
  activo más allá de existir en el roster.
- Responder directamente autoasigna al usuario actual y exige adjunto (pdf/jpg).
- Dos correos en la rama de reasignar (al nuevo asignado y al solicitante); uno en la
  rama de responder directo.

## 7. Reglas de respuesta/cierre

**Responder y cerrar son un único evento atómico** — mismo botón, mismo submit. El envío
marca `Estado="Cerrado"` y estampa fecha/hora en la misma operación; no hay estado
intermedio "respondido pero abierto". Único campo con validación real de no-vacío:
`Respuesta`. Efectos secundarios en orden: correo al solicitante (enviado **antes** de
guardar, sin comprobar éxito del guardado) → `SubmitForm` → mensaje de Microsoft Teams al
solicitante invitando a calificar.

**Restricción de navegación, no de datos:** el ícono "Responder" no navega si el área del
usuario es `LEGAL`, pero el filtro de datos de la pantalla no impone esa restricción — un
acceso directo (deep link) la evade. No es autorización real, es ocultación de UI.

## 8. Reglas de calificación

- Bandeja: solo el **solicitante** (`Título = correo del usuario`) ve tickets `Cerrado`
  sin calificar — identidad exacta, no rol.
- Campo `Calificación` requerido, pero **sin validación de rango 1–5 en la fórmula**: el
  rango es una convención del control visual de estrellas, no una regla de negocio
  validada. Decisión pendiente para la spec nueva: validar en servidor.
- Calificar no reabre ni cierra nada — el ticket ya está `Cerrado`; es puramente
  informativo/opcional pese al badge de "pendiente".
- Correo a quien resolvió el ticket, enviado **antes** de `SubmitForm`, sin manejo de
  error entre ambas llamadas.

## 9. Consulta

**Sin restricción de acceso por área, rol ni identidad** — cualquier usuario que llegue a
la pantalla ve y filtra la totalidad de `HelpDeskBd`, de todas las áreas, y puede
exportar a Excel el resultado sin control adicional. Filtros disponibles: Estado, Id
(acotado al estado elegido), Área remite, Área destino, Solicita (solo personal con
`Estado="Activo"`).

## 10. Autorización observada — antipatrones a no repetir

- **Identidad hardcodeada como regla de enrutamiento:** en las seis pantallas
  principales, `If(User().Email = "jimenatejeiro@rbcol.co", Navigate(HdLegal), ...)`.
  Control de acceso atado a una persona física, no a un rol/permiso nombrado — se rompe
  si esa persona cambia de correo o de cargo, y no admite suplencia sin editar código.
- **`Personal GCT` como matriz de permisos por columna booleana** (§1) — el antecedente
  directo de lo que el autorizador ejecutable de HelpDesk reemplaza.
- **Ocultar en UI ≠ autorizar:** el bloqueo de "Responder" para el área LEGAL es solo de
  navegación; el filtro de datos no lo replica (§7). Consistente con la regla dura del
  proyecto: ocultar en interfaz no sustituye la validación de servidor.
- Ninguna referencia a grupos de Entra ID/SharePoint (`IsMember`, `User().Roles`) en
  ningún archivo — toda la autorización se resuelve contra columnas de datos y
  comparaciones directas de correo.

## 11. `HdLegal` — qué es realmente

No es un módulo de dominio "Legal" con reglas de ticket distintas. Es un **atajo de
navegación para un único usuario** (el mismo correo hardcodeado de §10): esa persona cae
en `HdLegal` en vez de en `Asignar`/`Responder` genéricas. Funcionalmente es una fusión
de Responder + Asignar (de ahí sus 4.177 líneas), con un efecto adicional exclusivo: al
reasignar, crea un registro en `TareasLegal`, la tabla de **otra aplicación PowerApps
separada** ("oportunidapp") — confirmado por el texto literal del correo que dispara.
Un filtro que restringiría el destino a personal de área LEGAL está presente en el
código pero **comentado/inactivo**: cualquier persona del roster puede terminar
asignada. Decisión de producto explícita pendiente para HelpDesk: ¿se replica el puente
hacia `TareasLegal`/oportunidapp, o queda fuera de alcance?

## 12. Integraciones externas identificadas (todas client-side, ninguna vía Power Automate salvo una)

- `Office365Outlook.SendEmailV2` — invocado directamente desde Power Fx en creación,
  asignación, respuesta y calificación. Sin cola, sin reintento, sin registro de fallo.
  Confirma que esta lógica no se porta tal cual: se rediseña como efecto de servidor,
  siguiendo el patrón ya bueno de `helpdesk.ticket_sync_outbox`.
- `MicrosoftTeams.PostMessageToConversation` — tras cerrar un ticket.
- `ExpExcel.Run(...)` — flujo de Power Automate personalizado invocado desde "Descargar
  datos" en Consulta; su lógica interna no es visible desde este código.
- Enlace de Power BI "publish to web" — ver §0.

## 13. Decisiones tomadas y pendientes para las specs de HelpDesk

**Decidido (2026-09-03):**

1. **Calificación (§8):** el rango 1–5 se valida en servidor, no solo en el control
   visual — corrige el antipatrón del legacy.
2. **Calificar (§2, §8):** sigue siendo opcional, no se convierte en requisito de
   cierre de ciclo. Sujeto a revisión posterior.
3. **Colisión de prefijo de Id (§3): no era una decisión pendiente.** Verificado contra
   `sql/db/06_helpdesk_facts.sql` y `sql/db/02_functions.sql` — el esquema nuevo ya
   genera `codigo_ticket` como `HD-<año>-<secuencial>` (`helpdesk.next_codigo_ticket()`,
   secuencia de PostgreSQL + `UNIQUE`), sin derivar prefijo del área destino. La
   colisión `ADM-` del legacy no es reproducible en este diseño.
4. **`HdLegal` → `TareasLegal`/oportunidapp (§11):** fuera de alcance de HelpDesk.
5. **Excepción hardcodeada de `PROYECTOS Y TI` (§5):** se conserva como comportamiento,
   pero no como código quemado — el ticket de esa combinación sigue enrutando a Alex
   Bolaños, normalizado como una fila más en la tabla de enrutamiento (equivalente a
   `RecibeHelpdesk`), no como comparación hardcodeada en la lógica de la aplicación.

6. **Consulta (§9):** se acota mediante el autorizador ejecutable. Un usuario no debe
   poder ver ni exportar tickets fuera de su alcance de permiso — se reemplaza el acceso
   sin restricción del legacy por una consulta al permiso técnico y su alcance efectivo,
   nunca por comparación de rol a mano en la vista o el handler.

## Verificación contra código

| Afirmación | Evidencia |
|---|---|
| Máquina de estados de 3 valores sin reversa | `Asignar.pa.yaml`, `Responder.pa.yaml` — fórmulas de `Estado` citadas en §2 |
| Generación de Id sin verificación de unicidad | `Nuevo_1.pa.yaml`, fórmula citada en §3 |
| SLA en días hábiles vía `Días_Habiles` | `Nuevo_1.pa.yaml`, tabla de reglas en §4 |
| Consulta sin restricción de acceso | `Consulta.pa.yaml`, `Gallery2.Items` sin cláusula de área/rol |
| Email hardcodeado como enrutamiento | `Asignar.pa.yaml:153` y patrón idéntico en `Responder`, `Calificar`, `Consulta`, `Indicadores`, `Nuevo_1` |
| `HdLegal` escribe en `TareasLegal` | `HdLegal.pa.yaml`, único archivo del árbol que referencia esa lista (verificado por grep sobre los 10 `.pa.yaml`) |
| Power BI publish-to-web activo | `Indicadores.pa.yaml`, control `PowerBI@2.4.0`, `TileUrl` citada en §0 |

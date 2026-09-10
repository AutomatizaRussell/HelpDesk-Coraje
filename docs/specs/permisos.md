# Permisos ejecutables

```
ESTADO:      no implementado — no existe autorización de ninguna clase en el código
             publicado. La única barrera vigente es una contraseña compartida sobre
             una ruta, que no distingue personas
CORTE:       03-sep-2026
EVIDENCIA:   ninguna sobre HelpDesk. El modelo se adopta de `plataforma-impulsa`,
             cuyo catálogo y autorizador sí están publicados y verificados por lectura
BLOQUEO:     parcialmente levantado (03-sep-2026) — el usuario confirmó directamente,
             sin levantamiento formal, que no hay rol adicional detrás de las dos
             únicas excepciones hardcodeadas del legacy (§6). Sigue sin construirse la
             columna de rol en el directorio (`specs/acceso-empleados.md` §7.1)
```

**Autoridad:** este documento es propietario del gobierno de permisos. La identidad
interna vive en `specs/acceso-empleados.md`; la externa, en `specs/acceso-clientes.md`.
Autenticar no es autorizar, y este documento solo se ocupa de lo segundo.

## 1. Regla estructural

**PostgreSQL es la única fuente operativa de las reglas delegables.** El código consulta
un permiso técnico y su alcance efectivo; no compara roles.

> **`INVARIANTE`** Ninguna condición de rol se escribe en un componente, una vista, un
> handler ni un servicio. **Nada de comparar roles a mano, ni siquiera para ocultar
> interfaz.** Si el permiso no existe en el catálogo, se añade al catálogo y después se
> consume. Ocultar un botón no es autorizar: el *server action* que ese botón invocaba
> sigue exportado, y lo llama quien conozca su nombre.

## 2. Por qué un autorizador ejecutable y no condiciones dispersas

La alternativa —`if (usuario.rol === "ADMIN")` allí donde haga falta— falla de tres
maneras conocidas, todas observadas en el proyecto hermano antes de corregirlas:

1. **No se puede auditar.** No hay forma de responder «quién puede hacer esto» sin leer
   todo el código.
2. **Diverge.** La misma regla escrita en la vista y en el servicio se separa en el
   primer cambio, y la vista suele ser la que se actualiza.
3. **Se olvida.** Una ruta nueva sin condición queda abierta, y nada lo señala.

## 3. Separación de acciones

El catálogo distingue como acciones **separadas** lo que un rol suele hacer junto. La
regla que lo justifica: **quien prepara no expone.**

Aplicado al ticket, y sujeto a §6:

| Acción | Por qué es propia |
|---|---|
| Consultar | La lectura tiene su propia frontera de clientes |
| Crear en nombre de un cliente | Radicar por teléfono no es lo mismo que atender |
| Redirigir / clasificar | Decide a qué área va el trabajo |
| Asignar responsable | Decide de quién es el trabajo |
| Responder al cliente | **Sale de la firma.** Es la acción que expone |
| Registrar nota interna | No sale. Fricción mínima a propósito |
| Cerrar | Declara terminado |
| Rechazar | Declara que no se atiende, con motivo |
| Reabrir | Deshace un terminal |
| Administrar accesos de clientes | Concede acceso externo |
| Añadir/quitar observador (§10) | Da seguimiento sin dar responsabilidad de atender |
| Solicitar validación (§10) | Pide confirmación a alguien más antes de seguir; **no** es autorización excepcional (§5) |

> Los **reintentos técnicos son automáticos y durables**: no forman parte del catálogo
> de acciones manuales. El worker reclama lo elegible y la interfaz informa estado,
> intento y próxima ejecución. **No dependen del rol.**

## 4. Alcance, no solo permiso

Un permiso responde «qué puede hacer»; el alcance responde «sobre qué». Los dos se
evalúan, y el segundo es el que se olvida.

| Dimensión | Pregunta |
|---|---|
| Acción | ¿Tiene el permiso técnico? |
| Área | ¿El ticket pertenece a un área que le corresponde? |
| Cliente | ¿Tiene frontera sobre ese cliente? |
| Estado | ¿La acción procede desde el estado actual del ticket? |

**La interfaz solo presenta como efectiva una combinación de permiso y estado cuando el
servicio aplica la misma frontera.** Si difieren, la interfaz miente y el usuario
descubre el límite al chocar contra él.

## 5. Autorización excepcional

Una acción fuera del alcance ordinario —intervención administrativa, acceso
organizacional— **exige justificación escrita antes de ejecutarse**, y audita actor,
permiso, recurso, alcance, justificación, fecha y resultado.

Dos reglas que evitan que la excepción se vuelva rutina:

- **La justificación no se persiste como autorización.** Viaja con la acción y se audita
  contra ella. Una justificación que sobreviviera a la visita dejaría que una sesión
  posterior heredara un motivo que nadie escribió para ella.
- **La interfaz conserva lo escrito** mientras pide la justificación. Perder el trabajo
  por pedir un motivo enseña a evitar el motivo.

## 6. `RATIFICADO (parcial)` Los roles reales

Impulsa tiene Staff, Senior, Gerente, Socio y Admin, derivados de la estructura de una
firma de auditoría. **No se importan.** Una mesa de ayuda tiene otra forma, y el
esquema actual insinúa —sin definir— al menos tres figuras:

| Indicio en el esquema | Figura que sugiere |
|---|---|
| `core.dim_area.encargado_recepcion` | Alguien recibe lo que llega a un área |
| `helpdesk.routing_rule.encargado_interno` | Alguien queda como responsable por tipo de requerimiento |
| El módulo `/redireccion` completo | Alguien reparte lo que entra sin clasificar |

Ninguno de los tres es un rol declarado: son columnas de texto y una ruta.

**Confirmado (03-sep-2026), sin levantamiento formal de PowerApps — directamente por el
usuario.** El legacy solo se apartaba de la tabla de enrutamiento normal en dos casos
(`legacy/reglas-negocio-powerapps.md` §5, §11): `alexbolanos@rbcol.co` para
`PROYECTOS Y TI` y Jimena Tejeiro para `LEGAL`. Los dos siguen vigentes, y **ninguno
tiene ningún poder adicional** sobre el que ya sugiere la segunda fila de la tabla:
son la persona responsable de su área, nada más. No aprueban lo que otros no aprueban,
no ven lo que otros no ven. **La segunda figura (`encargado_interno`) es, hasta donde
hay evidencia, la única real.**

> **Lo que esto confirma y lo que no.** Son los dos únicos casos que el código legacy
> trataba distinto de las demás siete áreas —si alguna otra área tuviera una figura con
> más poder, es razonable esperar que también hubiera necesitado su propio caso especial
> en el código, y no se encontró ninguno más en la lectura completa de las nueve
> pantallas. Aun así, esto **no descarta** que aparezca un matiz al construir (una
> aprobación cruzada entre áreas, por ejemplo): confirma la ausencia de evidencia, no
> una garantía exhaustiva. Si aparece algo así, se nombra explícitamente cuando ocurra,
> no se asume ahora por analogía.

> `RIESGO` `core.dim_personal` **no tiene columna de rol de aplicación** y se alimenta
> desde SharePoint por el ELT. Ver `specs/acceso-empleados.md` §7.1: el mismo hueco
> bloquea la admisión y la autorización, y se resuelve una sola vez.

## 7. Criterios de aceptación

- No existe **ninguna** comparación de rol fuera del autorizador, verificado por
  búsqueda sobre `src/`.
- Cada acción del catálogo está conectada al autorizador **en servidor**, no solo
  presente en una tabla.
- Existe **prueba negativa** por cada frontera que importa: el rol que no puede
  responder al cliente no puede hacerlo tampoco invocando el *server action* directo.
- La autorización excepcional exige justificación **antes** de ejecutar, y el orden se
  verifica.
- Un permiso presente en el catálogo pero no consultado por ningún servicio **se detecta
  como tal**: presencia en el catálogo no es autorización aplicada.

## 8. Orden de implementación

| # | Entrega | Depende de |
|---|---|---|
| 1 | Levantamiento de roles reales | `specs/tickets.md` §2 |
| 2 | Columna de rol en el directorio | 1, `specs/acceso-empleados.md` §7.1 |
| 3 | Catálogo de acciones y autorizador ejecutable | 2 |
| 4 | Conectar cada acción del ciclo del ticket | 3, `specs/tickets.md` |
| 5 | Autorización excepcional con justificación y auditoría | 4 |
| 6 | Consola de consulta de la matriz | 5 |

---

## 9. Verificación contra código

Sin implementación; la tabla queda escrita para la unidad que la construya.

| # | Afirmación a verificar | Dónde comprobarlo |
|---|---|---|
| V1 | No hay comparaciones de rol fuera del autorizador | `grep` sobre componentes, handlers y servicios |
| V2 | Cada acción del catálogo se consulta en servidor antes de ejecutar | Guards de cada servicio |
| V3 | Pruebas negativas por frontera de rol | Tests de autorización |
| V4 | La justificación se exige antes de ejecutar, no después | Orden de validación en el handler excepcional |
| V5 | La auditoría registra los siete campos de §5 | Modelo y escritura |
| V6 | La interfaz y el servicio comparten frontera de estados | Comparar condición de la vista con la del servicio |
| V7 | Un observador no puede ejecutar ninguna acción del catálogo | Guard del servicio + prueba negativa |
| V8 | Solicitar validación no exige la justificación obligatoria de §5 | Comparar los dos handlers |

## 10. `PROPUESTA` Observadores y solicitud de validación — confirmado para v1

```
FUENTE:  prototipo funcional (`helpdesk_santi/`), confirmado por el usuario para v1
         (03-sep-2026). Detalle funcional completo en `specs/tickets.md` §11 — este
         documento solo fija lo que le corresponde: permiso y alcance.
```

- **Observador: alcance de solo lectura, sin permiso de acción.** Ve el ticket bajo la
  misma regla de `visibilidad` que un agente interno (`specs/tickets.md` §6), pero el
  catálogo de acciones (§3) no le concede ninguna entrada. Añadir/quitar observador es
  una acción propia, sujeta al alcance ordinario de §4 (¿tiene permiso sobre el área o
  cliente del ticket?), no un efecto secundario de otra acción.
- **Solicitar validación no es autorización excepcional (§5) y no debe tratarse con su
  mismo mecanismo.** No exige justificación obligatoria ni auditoría de excepción — es
  un paso ordinario del catálogo, con su propio permiso. Confundir los dos mecanismos
  al construir volvería trivial la excepción de §5: cualquier "pedir confirmación"
  quedaría disfrazado de intervención administrativa.
- **Ambas acciones comparten el mismo bloqueo que §6 ya declara `ABIERTO`.** Dirigir un
  evento a "Jefe de área" o a "Administrador del sistema" —como hace el prototipo—
  exige saber a qué persona real corresponde ese puesto hoy. Sin catálogo de
  roles/puestos, la única alternativa honesta en v1 es dirigir observadores y
  solicitudes de validación a personas reales de `core.dim_personal` elegidas una por
  una, no a una etiqueta de rol. Formalizar el catálogo de puestos queda fuera de esta
  decisión.

**Changelog:** 03-sep-2026 — línea base. Adopta el modelo de autorizador ejecutable de
Impulsa y la separación «quien prepara no expone» (§3); declara que los roles reales
están bloqueados por el levantamiento de PowerApps y que no se importan los de Impulsa
(§6).
- 03-sep-2026 (mismo día) — añade dos acciones al catálogo (§3) y §10: Observadores y
  solicitud de validación, confirmados para v1. Distingue explícitamente solicitud de
  validación de la autorización excepcional (§5) para que no se construyan como el
  mismo mecanismo.
- 03-sep-2026 (mismo día) — §6 pasa de `ABIERTO` a `RATIFICADO (parcial)`: el usuario
  confirma directamente, sin levantamiento formal de PowerApps, que las dos únicas
  excepciones del legacy (Alex, Jimena) no cargan ningún rol adicional — son
  `encargado_interno` de su área, sin más. Queda declarado qué tanto puede sostener esta
  confirmación y qué no.

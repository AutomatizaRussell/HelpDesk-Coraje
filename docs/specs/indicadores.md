# Indicadores

```
ESTADO:      capa de datos desplegada y conciliada contra la base real (corte 82).
             Panel `/indicadores` y permiso `indicadores.ver` construidos (corte
             83), sin desplegar. Vista en H2 (I4)
CORTE:       06-nov-2026
EVIDENCIA:   inventario leído del .pbit «IND HELPDESK» (05-nov-2026); conciliación
             en la base real (I5); SQL del panel contra PGlite (I6)
```

**Autoridad:** este documento es dueño de qué mide el panel de indicadores y cómo. El
ticket y sus estados viven en `specs/tickets.md`; los permisos, en `specs/permisos.md`.

## 1. Qué se trae

El Power BI «IND HELPDESK», que hoy abre la pantalla `Indicadores` de PowerApps. Se
trae su **lógica**; el diseño es propio. Lee dos listas de SharePoint: `HelpDeskBd` y
`Personal GCT`, esta última solo para mostrar nombres.

| Página | Contenido |
|---|---|
| Tickets recibidos | Total, respondidos, sin respuesta; por área destino, área que remite y receptor; calificación de oportunidad por área destino |
| Tickets creados | Lo mismo, filtrado por área que remite y con creador en lugar de receptor |
| Detalle recibidos / creados | Lista de tickets con sus campos |
| % Oportunidad respuesta | Promedio por área destino, histórico mensual, detalle por ticket |
| Calidad Tickets | Promedio de la calificación por mes y por responsable |

Filtros: año, mes, área destino o que remite, estado, tipo de requerimiento,
responsable. El año y el mes son los de la **fecha de solicitud**.

## 2. Decisiones (05 y 06-nov-2026)

- **La lógica se copia tal cual**, incluida la escala de oportunidad, que se redefinirá
  después. Solo se corrige lo objetivamente mal (§4).
- **Datos:** solo `SHAREPOINT_LEGACY` mientras PowerApps siga en uso, para poder
  conciliar contra el Power BI. Al apagarlo, los tickets de HelpDesk.
- **Visibilidad:** primero sin jerarquía, con el permiso del catálogo y alcance total
  (no hay usuarios reales). Después, por nivel fijado en el ticket (U40,
  `estado/plan-ejecucion.md`, U39).
- **Fuente del personal:** la lista hasta el final; Conecta **antes** de apagar
  PowerApps, nunca después: al apagarlo se apaga la Transform 03.

## 3. Traducción a `helpdesk.v_indicador_ticket`

Una fila por ticket, sin filtrar por origen. Las fechas son fechas de Bogotá.

| DAX | Vista |
|---|---|
| `Fecha_Solicitud` | `fecha_solicitud` (de `fecha_creacion`) |
| `Fecha_Max_Respuesta`, `Fecha_Respuesta` | `fecha_max_respuesta`, `fecha_respuesta` |
| `Respuesta <> ""` | `respondido` |
| `[dias respuesta]` | `dias_respuesta` |
| `[Califica oportunidad respuesta]` | `categoria_oportunidad`, mismas etiquetas |
| `[Porcentaje calificación]` | `porcentaje_oportunidad` |
| `HOY()` en columna calculada | Hoy en Bogotá **al consultar**, no al refrescar |

**H1, hipótesis sobre los blancos del DAX:** un `DATEDIFF` con una fecha en blanco da
blanco, y el blanco vale 0 al compararlo. Efecto: un ticket `Media` cerrado sin fecha de
respuesta sale `1.Excelente`, y uno abierto sin fecha límite, vencido. Se confirma o se
corrige con la verificación puntual de §5.

Medidas, que calcula quien consulta sobre la vista:

| Medida | Definición |
|---|---|
| Total | Tickets con área destino |
| Respondidos / sin respuesta | De esos, con y sin `respondido` |
| % oportunidad | Promedio de `porcentaje_oportunidad`, sin los `NULL` |
| Calidad | Promedio de `calificacion` |

### 3.1 El panel

`/indicadores`, en la navegación de Interno con `indicadores.ver`. Cuatro pestañas
cubren las seis páginas del Power BI:

| Pestaña | Contenido |
|---|---|
| Volumen | Tickets por área destino, por área que remite, por responsable y por solicitante; tickets por mes |
| Oportunidad | % por área destino, escala por área destino, % por mes |
| Calidad | Calificación por mes y por responsable |
| Tickets | Los 200 más recientes del filtro |

- **Filtros:** año, mes, área destino, área que remite, estado, tipo de requerimiento y
  responsable. Van en la URL, comunes a las cuatro pestañas.
- **Cabecera del área,** la de la bandeja, con las cinco cifras: tickets, respondidos,
  sin respuesta, oportunidad y calidad.
- **Color:** el del área destino filtrada o, sin ese filtro, el del área de quien
  entra. En los gráficos por área, cada barra lleva el color de su área
  (`design/sistema-helpdesk.md` §5.9).
- **Diferencias de forma con el Power BI:**
  - El gráfico combinado de dos ejes (volumen y % por mes) son dos gráficos
    (`design/sistema-helpdesk.md` §5.9).
  - Los rankings de personas muestran las 12 con más tickets; las demás están en la
    tabla del gráfico.
  - Los tickets legacy de cliente, sin solicitante (U21), aparecen como «Ticket de
    cliente» en lugar de desaparecer.
- **SQL:** vive en `src/server/indicadores/indicadores-sql.ts`, separado de su
  ejecución, para probarlo tal cual contra PostgreSQL.

## 4. Lo que se corrige frente al Power BI

- **Universo de las tres cifras.** En el DAX, el total exige área destino y respondidos
  y sin respuesta no. Aquí las tres usan el mismo. En los datos del 05-nov no cambia
  ningún número: 0 tickets sin área destino.
- **Receptor.** El DAX lo toma de `AsignadoA`. Si quien recibió respondió sin
  reasignar, el ticket no cuenta en «Tickets por receptor». Aquí es `id_asignado`, que
  la ingesta toma de `AsignadoA` o, si está vacío, de `Recibe` (`tickets.md` §4.2).
- **Fecha de solicitud.** El DAX usa `Fecha_Solicitud`, un campo que PowerApps
  escribía y que se podía editar. Aquí es `Created`, la marca de SharePoint, la única
  que existe para los tickets nuevos. Conciliado el 06-nov-2026, difieren en 12 de 3.090
  tickets, entre 1 y 2 días, en los dos sentidos; en alguno la solicitud es posterior a
  la creación del ítem. Ninguno cambia de mes ni de categoría.
- **Días hábiles,** en un segundo paso. La vista vigente cuenta días calendario para
  poder conciliar. Una vez conciliada, se pasa a `core.add_colombia_business_days`, y
  `indicador-ticket.contract.test.mts` se actualiza en esa misma unidad.

## 5. Conciliación

`estado/operacion.md`, «Conciliación de indicadores (U39)». Compara ticket por ticket
dos traducciones independientes del DAX:

- una sobre los campos crudos de `staging.sp_helpdesk_raw`, como los lee el Power BI;
- la vista, sobre `fact_ticket`, como los ve HelpDesk.

Una diferencia apunta a la ingesta o a la traducción. Lo que esto **no** prueba es que la
lectura de la semántica del DAX sea correcta, porque las dos versiones salen de la misma
lectura. Eso lo cubre una sola verificación puntual contra el reporte: total,
respondidos, sin respuesta y % oportunidad, sin filtros.

## 6. Verificación contra código

| # | Afirmación | Dónde | Veredicto |
|---|---|---|---|
| I1 | Cada rama de la escala da la categoría y el peso del DAX | `20261106100000_indicadores_ticket` | **Probado contra PGlite** (06-nov-2026): 16 casos calculados a mano, con la ingesta real (06 y 07) como `coraje_etl` |
| I2 | La conciliación da 0 diferencias si los datos coinciden, y detecta fechas corridas | Consulta de `operacion.md` | **Probado contra PGlite**: 0 en todos los campos; con la ingesta en UTC, 16 de 16 fechas límite marcadas |
| I3 | Las fechas legacy se guardaron a medianoche de Bogotá | `docker-compose.yml` (`TZ: America/Bogota`) | **Verificado** el 06-nov-2026 por la conciliación en la base real: 0 diferencias en fecha límite y de respuesta |
| I6 | El SQL del panel corre como `coraje_runtime`, sus agrupaciones suman el total y los filtros acotan | `indicadores-sql.ts`, `20261106110000_indicadores_panel` | **Probado contra PGlite** (06-nov-2026): 33/33, con la cadena completa, la ingesta real, 17 casos (H2 incluido), el SQL del módulo tal cual y la conciliación copiada de `operacion.md`. Sin desplegar |
| I5 | La vista reproduce el Power BI sobre los datos reales | Conciliación de `operacion.md` | **Ejercitado** el 06-nov-2026: 3.090 de 3.090 tickets; categoría, porcentaje, respuesta y calificación sin diferencias; medidas idénticas (3.090 / 2.840 / 250 / 73,13 % / 4,8825). Única diferencia: fecha de solicitud en 12 (§4) |
| I4 | Cómo trata el DAX un `DATEDIFF` con fecha en blanco | Power BI | **H1 descartada el 06-nov-2026.** Microsoft no lo documenta. La regla general de SQLBI («a blank value is always converted to 0 … depending on the data type requested») indica que el blanco se lee como la fecha 0, el 30-dic-1899 (**H2**, inferida). Afecta a 6 tickets legacy: 2 cerrados sin fecha de respuesta y 4 sin fecha límite; como mucho 0,15 puntos del % global. Se adopta H2 sin verificar contra el reporte, porque la escala se redefinirá |

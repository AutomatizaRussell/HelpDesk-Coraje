# Hallazgos de Migración

## 1. SharePoint codifica nombres internos

En `TipoReqHD`, las columnas visibles `Categoría1` y `Categoría2` llegan en JSON como:

- `Categor_x00ed_a1`
- `Categor_x00ed_a2`

No usar:

- `Categoria1`
- `Categoria2`

## 2. `TipoReqHD.Title` no es tipo

`Title` representa el área funcional.

Relación correcta:

- `TipoReqHD.Title` -> `core.dim_area.nombre_area`
- `TipoReqHD.Tipo_Requerimiento` -> `helpdesk.dim_tipo_requerimiento.tipo_requerimiento`
- `TipoReqHD.Categor_x00ed_a1` -> `categoria_1`
- `TipoReqHD.Categor_x00ed_a2` -> `categoria_2`

## 3. `HelpDeskBd` también usa categorías codificadas

La lista principal usa:

- `Categor_x00ed_a1`
- `Categor_x00ed_a2`

para resolver el tipo del ticket.

## 4. Normalización textual robusta es obligatoria

Se encontró doble espacio interno en:

`IMPUESTOS  ASESORATE`

Eso rompía joins aunque visualmente parecía correcto.

La función `core.norm_text()` debe:

- convertir a mayúsculas
- quitar tildes básicas
- convertir Ñ
- limpiar NBSP, tabs y saltos
- colapsar múltiples espacios internos
- convertir vacío a NULL

## 5. Eventos legacy no son registros reales

Los eventos se infieren desde columnas de `HelpDeskBd`:

- `Comentarios_adicionales`
- `Observaci_x00f3_n`
- `Respuesta_Sugerida`
- `Justifique_Prioridad`

Por eso se usa `event_hash` para idempotencia.

## 6. Existen tickets legacy con jerarquía desplazada

Casos detectados:

- `ADMINISTRACIÓN / AUTOMATIZACIÓN / APLICACIÓN`
- `ADMINISTRACIÓN / TI / HARDWARE`
- `REVISORÍA / IMPUESTOS / RENTA`
- `REVISORÍA / IMPUESTOS CONSULTA / IVA`

Se resuelven mediante lógica legacy en `06_transform_ticket.sql`.
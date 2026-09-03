# Reglas Legacy de Clasificación

## Regla 1 — Administración / Proyectos y TI

Tickets antiguos pueden venir como:

- Área: ADMINISTRACIÓN
- Tipo_Requerimiento: AUTOMATIZACIÓN
- Categoría1: APLICACIÓN / SOPORTE / MEJORAS

Deben mapearse a:

- Área: ADMINISTRACIÓN
- Tipo_Requerimiento: PROYECTOS Y TI
- Categoría1: AUTOMATIZACIÓN
- Categoría2: valor original de Categoría1

También:

- Tipo_Requerimiento: TI
- Categoría1: HARDWARE / SOFTWARE / REDES

Debe mapearse a:

- Tipo_Requerimiento: PROYECTOS Y TI
- Categoría1: TI
- Categoría2: valor original de Categoría1

## Regla 2 — Revisoría / Impuestos

Tickets antiguos pueden venir como:

- Área: REVISORÍA
- Tipo_Requerimiento: IMPUESTOS
- Categoría1: IVA / ICA / RENTA / RETEFUENTE / RETEICA / OTROS IMPUESTOS

o:

- Área: REVISORÍA
- Tipo_Requerimiento: IMPUESTOS CONSULTA
- Categoría1: IVA / ICA / RENTA / RETEFUENTE / RETEICA / OTROS IMPUESTOS

Deben mapearse a:

- Tipo_Requerimiento: IMPUESTOS ASESORATE
- Categoría1: valor original
- Categoría2: NULL

## Regla 3 — No inventar clasificación

Los tickets sin información suficiente no se fuerzan.

Casos actuales sin `id_tipo_req`:

- 1521 | CONTABILIDAD | NULL | NULL | NULL
- 1699 | ADMINISTRACIÓN | PROYECTOS Y TI | TI | APLICACIÓN
- 1755 | ADMINISTRACIÓN | PROYECTOS Y TI | OTROS | NULL
- 2592 | ADMINISTRACIÓN | PROYECTOS Y TI | NULL | NULL
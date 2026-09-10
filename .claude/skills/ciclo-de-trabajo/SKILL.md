---
name: ciclo-de-trabajo
description: >-
  Protocolo de cambio seguro, criterio de finalización, clasificación de evidencia,
  disciplina Git y resolución de contradicciones documentales. Úsala SIEMPRE que se
  vaya a modificar un sistema existente, cerrar una unidad de trabajo, declarar algo
  terminado o validado, publicar un commit, o cuando existan fuentes que se
  contradigan sobre el estado real. Aplica aunque el usuario no lo pida: proponer un
  cambio sobre código o infraestructura existente ya es el disparo. Complementa las
  skills de código y arquitectura, que cubren el CONTENIDO del cambio; esta cubre el
  PROCESO.
---

# Ciclo de trabajo y criterio de finalización

## Protocolo de cambio seguro
Ejecuta en orden. No saltes pasos ni los declares cumplidos sin evidencia.

| Paso | Acción |
|---|---|
| **A. Inspeccionar** | Confirmar contexto, estado real, alcance, convenciones, dependencias, archivos afectados y evidencia vigente **antes** de modificar. Nunca proponer cambios sobre un sistema existente sin revisar sus fuentes reales. |
| **B. Definir** | Fijar la regla funcional, las invariantes que deben preservarse y los escenarios de fallo. Buscar causa raíz antes de corregir; distinguir solución estructural, mitigación temporal y parche. |
| **C. Aplicar** | Cambio mínimo suficiente, con precondiciones verificadas y sin dejar estados parciales frágiles. |
| **D. Validar** | Controles proporcionales al riesgo. Revisar los *resultados*, no solo que el comando se ejecutó. |
| **E. Publicar** | Revisar diff, secretos y archivos temporales; staging selectivo; commit focal. |
| **F. Observar** | Comprobar salud, logs, datos y comportamiento visible tras el despliegue. |
| **G. Cerrar** | Actualizar únicamente la documentación, decisión o runbook cuya verdad haya cambiado, y solo con evidencia confirmada. Retirar contradicciones. |

## Criterio de finalización
Un cambio no está terminado porque el código fue escrito. Está terminado cuando: cumple el alcance acordado, preserva las invariantes, supera la validación definida, deja trazabilidad suficiente y no introduce artefactos ni riesgos ocultos conocidos.

Al cerrar una unidad, registra: estado previo (problema o riesgo demostrado), cambio (regla y componentes afectados), evidencia, incidencias y su resolución, decisión (cerrada / parcial / revertida / diferida), commit y documentación actualizada.

## Clasificación de evidencia
Nunca trates toda validación como equivalente. Declara siempre qué demuestra y qué **no** demuestra:

| Tipo | Demuestra | No demuestra |
|---|---|---|
| Pruebas contractuales / estáticas | Estructura, invariantes, presencia de decisiones en código | Despliegue, integración real, UX |
| Unitarias / de dominio | Transiciones, idempotencia, autorización acotada | Comportamiento de navegador, red o proveedor externo |
| Integración contra motor real | Persistencia, constraints, transacciones | Flujo completo de usuario |
| E2E / staging | Operación real observada en escenarios específicos | Que la versión *actual* fue validada, si el corte es anterior |
| Inspección de repositorio | Estado implementado y contradicciones documentales | Salud de producción |

Errores típicos que debes señalar: confundir pruebas contractuales con E2E; extrapolar evidencia de staging a producción; asumir que evidencia de un corte anterior valida el HEAD actual; que exista un feature gate no demuestra que el rollback funcione.

## Precedencia ante contradicción
Cuando las fuentes discrepen, no resuelvas en silencio: nombra la contradicción y aplica el orden de autoridad del proyecto. Orden por defecto si el proyecto no define otro:

1. Decisión aprobada explícita
2. Especificación vigente (versión declarada como fuente)
3. Código y migraciones vigentes
4. Pruebas
5. Handoff fechado
6. Documentos históricos (versiones superadas: antecedentes, nunca estado actual)

Distingue siempre **estado implementado** de **comportamiento aprobado**: que algo esté en el código no significa que sea la decisión vigente, y viceversa.

## Disciplina Git
- Revisar `git status --short` y `git diff --check` antes de preparar un commit.
- Staging selectivo con rutas explícitas o `git add -p`. **Nunca `git add .`**
- `git commit --amend --no-edit` (y `push --force-with-lease`) solo durante el refinamiento de la **misma unidad de trabajo** y con HEAD verificado.
- **Sesiones concurrentes:** otra sesión o chat puede haber publicado commits. Verifica HEAD antes de recomendar un amend; si HEAD ya no pertenece a tu unidad, crea un commit nuevo con staging selectivo.
- Mensaje focal. No mezclar unidades de trabajo en un commit.
- No dejar artefactos temporales ni respaldos `.bak-*` en el repositorio.

## Activación gradual (cambios de riesgo alto)
Habilitar para un caso controlado → observar una ventana acordada → ampliar a grupo limitado → extender gradualmente → cerrar activación con registro de decisión. Cada etapa con su salida verificable y condición explícita de abortar.

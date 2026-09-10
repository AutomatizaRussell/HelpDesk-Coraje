---
name: diseno-y-experiencia
description: >-
  Contrato universal de diseño de interfaz y experiencia de producto. Úsala SIEMPRE
  que se diseñe o construya UI: vistas, componentes, layouts, navegación, formularios,
  tablas, overlays, modales, estados de carga/error/vacío, responsive o accesibilidad.
  Cubre principios rectores, arquitectura de tokens, tipografía, color y superficies,
  navegación, jerarquía de acciones, overlays, selección transaccional, resiliencia de
  datos y validación responsive. Aplica aunque no se mencione "diseño": pedir una
  pantalla, un componente o una vista ya es el disparo.
---

# Diseño y experiencia de producto

Contrato transversal para interfaces sobrias, coherentes, accesibles y operativamente eficientes. Cada producto aporta identidad, tokens concretos y excepciones **sin duplicar** este contrato.

## Principios rectores
- **Minimalismo funcional:** eliminar ruido y redundancia sin ocultar información necesaria.
- **Jerarquía estructural:** usar orden, espacio, proximidad y contraste antes de recurrir a color o negrilla.
- **Claridad operativa:** explicar estado, atención requerida, acción disponible y consecuencia.
- **Consistencia sistémica:** componentes equivalentes consumen los mismos tokens y variantes explícitas.
- **Densidad proporcional:** listados priorizan escaneo; formularios y decisiones críticas priorizan comprensión.
- **Accesibilidad por defecto:** teclado, foco visible, contraste, semántica, objetivos táctiles y `prefers-reduced-motion` son base, no extras.
- **Adaptación real:** responsive reordena y cambia patrones; no encoge mecánicamente el escritorio.
- **Movimiento funcional:** la animación comunica transición, relación espacial o respuesta; no adorna.

## Arquitectura del contrato (capas)
Marca (activos e identidad) → **Tokens semánticos** (texto, superficies, bordes, acciones, estados, tamaños, espacios, radios, sombras, breakpoints, movimiento) → **Componentes** (primitivas y variantes que consumen exclusivamente tokens) → **Patrones** (listas, formularios, matrices, overlays, flujos) → **Producto** (acento, densidad, excepciones del dominio).

Cambiar un token global afecta a todos los componentes del mismo concepto: ese es el punto. Un valor visual local exige una necesidad única documentada. La migración es progresiva al intervenir cada vista, nunca una reescritura masiva no validada.

## Tipografía
Familia definida por producto con un conjunto limitado de pesos **reales**, no sintetizados. Regular domina el contenido; medium/semibold refuerzan jerarquía; bold para énfasis puntual. Escala por roles semánticos (identidad, título de página, sección, etiqueta, cuerpo, metadato, dato tabular), no por tamaños arbitrarios. Números, fechas, estados y metadatos con alineación estable para comparar.

## Color y superficies
Un acento funcional principal por producto; los demás colores se reservan para estados o identidad controlada. Fondos neutros, superficies blancas, bordes tenues, sombras discretas. Una tarjeta agrupa una entidad, decisión o tarea real; dentro de una misma tarea, divisores antes que tarjetas anidadas. La elevación indica relación espacial: nada de gradientes, brillos o sombras grandes como tratamiento por defecto.

## Navegación y shell
Una sola navegación lateral persistente; en ancho intermedio pasa a rail o drawer; en móvil, navegación inferior para destinos principales. Topbar contextual: regreso opcional, icono de módulo, título corto, contexto dinámico y acciones globales discretas. El regreso usa un **destino controlado**, no depende solo del historial del navegador. Iconos sin etiqueta visible requieren tooltip, foco visible y nombre accesible.

## Jerarquía de acciones
| Nivel | Uso | Tratamiento |
|---|---|---|
| Primaria | Confirma, crea, guarda o aplica una decisión | Superficie sólida de acento, alto contraste. **Una por contexto** |
| Secundaria | Abre selección, personaliza, cambia configuración | Fondo neutro, borde tenue, hover de acento tenue |
| Terciaria | Navega o administra sin dominar la tarea | Sin superficie permanente; texto o icono discreto con foco visible |
| Destructiva | Elimina, rechaza o desactiva | Declara el efecto concreto; **no recibe foco inicial** |

## Overlays y navegación interna
Overlay centrado: sombra y oscurecimiento solo para una relación espacial real. Evitar modal dentro de modal o drawer dentro de modal; para crear o editar, preferir navegación interna en la misma superficie. Al volver de un formulario al listado se preservan búsqueda, filtros, scroll y contexto. Con cambios sin guardar, cerrar / volver / clic en fondo / Escape debe advertir antes de descartar.

## Selección transaccional
La selección temporal se mantiene **separada** del estado aplicado: Cancelar descarta, Aplicar confirma. La fila completa es seleccionable pero conserva un input semántico real. La selección se distingue por forma, borde, fondo e icono, no solo por color. Búsqueda, contador y lista con scroll pertenecen al diálogo, no a la tarjeta de configuración.

## Datos, formularios y resiliencia
Filas compactas, encabezados sobrios, divisores horizontales, acciones estables. Las matrices conservan comparación cruzada con encabezados y primera columna persistentes; no se convierten automáticamente en tarjetas. Errores en contexto. **Regla dura: un error recuperable nunca borra entradas, checks, archivos seleccionados ni progreso válido.** Cubre siempre los estados relevantes: carga, vacío, éxito, error recuperable, error bloqueante, sin permiso y contenido parcial.

## Autorización en la interfaz
Visibilidad de una entidad y autorización para ejecutar una acción son controles **independientes**, ambos validados en servidor. La denegación en interfaz no sustituye la protección del límite de servidor: las acciones sensibles deben resistir invocación directa, repetición y manipulación del cliente. Una autorización excepcional exige justificación explícita antes de ejecutar, queda auditada (actor, recurso, permiso, resultado) y la interfaz no la presenta como operación ordinaria.

## Responsive y validación mínima
Validar al 100% de zoom y con el escalado habitual del sistema operativo. Probar nombres largos, datos vacíos, grandes volúmenes, errores y procesos activos. Matriz: escritorio amplio, portátil corporativo, estrés de escritorio (rail/drawer/ocultamiento controlado) y móvil (reorganización real). No exigir paridad visual entre tamaños; exigir claridad y **paridad funcional**.

## Criterio de cierre
Ninguna regla se considera implementada hasta que componentes y vistas consuman el contrato y superen validación real. Crear componentes compartidos antes de eliminar estilos repetidos, sin abstracciones prematuras. Cada excepción declara propósito, alcance y condición de retiro. Una vista termina cuando conserva tarea, jerarquía, accesibilidad y operación en la matriz definida, consume el contrato y cubre los estados relevantes.

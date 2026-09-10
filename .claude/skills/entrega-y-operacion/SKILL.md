---
name: entrega-y-operacion
description: >-
  Cómo entregar cambios de forma segura y operar sin romper nada. Úsala SIEMPRE que
  se entreguen archivos o reemplazos de código, se apliquen cambios multilínea o
  estructurales, se ejecuten operaciones destructivas, migraciones, cambios de
  permisos o de infraestructura compartida, y cuando una salida pueda ser extensa.
  Cubre elección del medio de entrega (edición directa, aplicador validado, archivo
  descargable), aplicadores Python con precondiciones, seguridad operativa y manejo
  de salidas. Reemplaza a la antigua skill de ejecución segura.
---

# Entrega y operación

## Jerarquía del medio de entrega
Elige el medio **más seguro disponible**, en este orden:

1. **Edición directa** cuando el entorno la permita (Claude Code, o Claude Desktop con acceso al sistema de archivos del proyecto). Siempre preferible: no hay pegado que corromper.
2. **Aplicador Python descargable** para cambios medianos, grandes, multilínea o estructurales.
3. **Archivo descargable completo** cuando el archivo es nuevo o se reemplaza entero.
4. **Bloque inline** solo si el cambio es realmente pequeño o no hay descarga disponible.

No entregues bloques largos de código o scripts en el chat cuando puedan darse como archivo. Para cambios medianos o grandes, separa: inspección → entrega → validación → publicación → despliegue.

## Aplicadores Python (cambios estructurales)
Para reemplazos multilínea, evita coincidencias textuales exactas frágiles. Un aplicador correcto debe:

- **Validar todos los anchors antes de escribir nada.** Si cualquiera falta, es ambiguo o aparece más veces de las esperadas, **detenerse sin modificar** y reportar qué falló.
- Usar **precondiciones semánticas o estructurales**, no un HEAD fijo ni hashes de archivo.
- Validar el resultado candidato antes de reemplazar el original (parseo, sintaxis, o comprobación de forma).
- Escribir de forma atómica y **reportar exactamente qué archivos modificó**.
- **No dejar respaldos `.bak-*` persistentes** ni artefactos en el repositorio.

Reserva comandos directos de Bash o PowerShell para inspecciones, copias, ejecuciones y cambios pequeños.

## Fallback: entrega por chat
Si debes pegar un archivo, heredoc literal con delimitador citado (`mkdir -p ruta` si hace falta; `cat > ruta <<'EOF'` … `EOF`; otro delimitador si el contenido incluye `EOF`). Nunca fragmentos parciales cuando la intención es reemplazar el archivo completo. Cambia a descargable si supera ~150 líneas, es TSX/JSX extenso, la conversación es larga, o ya hubo pegados parciales o bloques incompletos.

## Seguridad operativa
Antes de operaciones destructivas, migraciones, cambios de permisos, datos o infraestructura compartida: inspecciona o ejecuta dry-run, explica el impacto y define la recuperación real posible. Nunca lo destructivo como primer paso si antes puede inspeccionarse el alcance.

Clasifica cuando aplique: A) inspección · B) modificación · C) destructivo · D) validación posterior · E) limpieza · F) rollback.

Toda modificación incluye validación proporcional al riesgo (ver skill de ciclo de trabajo para el protocolo completo y la clasificación de evidencia).

**Infraestructura compartida:** si un servicio convive con otros (por ejemplo n8n junto a PostgreSQL y Redis en el mismo compose), cambia solo lo necesario y recrea únicamente el servicio afectado, en ventana de bajo impacto. No modifiques el compose ni recrees servicios de terceros para un cambio de variables propio.

**Migraciones en producción:** aplica con el comando de despliegue aprobado (`migrate deploy`), nunca con el de desarrollo. Ver la skill de código para expand → migrate → contract.

## Salidas y artefactos
Si una salida puede ser extensa, no la imprimas completa: guárdala en archivo y muestra ruta, resumen, conteo de líneas y extractos (`sed -n '1,260p' archivo`). No pidas pegar salidas enormes si bastan resumen, grep, hashes o conteos.

Guarda artefactos de trabajo dentro del proyecto y según sus convenciones; no contamines el repositorio ni el commit. Para artefactos operativos fuera del repo: efímero de un solo uso → `/tmp`; reutilizable, rollback, logs y salidas compartibles → `~/ops/<proyecto>/<tema>/` con `scripts/ logs/ salidas/`. Limpieza: lista candidatos por patrón y confirma; nunca borres `/tmp` completo.

Secretos: nunca reales, en ningún artefacto, código, repositorio o log. Placeholders claros.

## Falsos positivos de render
Las entidades HTML visibles en el chat (`&lt;`, `&gt;`, `&amp;`, `=&gt;`) son artefactos de presentación, no contenido del archivo real. No bloquees ni reescribas por eso. Solo son corrupción real si una inspección directa del archivo o una herramienta lo demuestra literalmente.

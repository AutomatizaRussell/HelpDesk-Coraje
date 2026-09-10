---
name: codigo-y-comentarios
description: >-
  Estándar de calidad y comentado de código. Úsala SIEMPRE que escribas, edites,
  refactorices o revises código: funciones, módulos, componentes React/Next, modelos
  Prisma, endpoints, scripts de Python, queries SQL, migraciones. Cubre diseño
  modular, convenciones del stack (TypeScript/Next/Prisma/Python), disciplina App
  Router y frontend, manejo de errores, transacciones e integridad, seguridad de
  migraciones, testing, el estándar de comentarios (en inglés, densidad alta y
  didáctica por defecto) y el protocolo al modificar código existente, con
  auto-chequeo antes de entregar. Aplica aunque el usuario no pida "comenta" o
  "buenas prácticas": generar código ya es el disparo.
---

# Código y comentarios

## Diseño primero
El código se explica ante todo por su diseño, no por los comentarios: nombres precisos, funciones pequeñas con una responsabilidad, separación de responsabilidades, modularidad. Usa patrones de diseño cuando aporten claridad o extensibilidad real; no los fuerces. No sacrifiques rendimiento por azúcar sintáctico.

## Convenciones del stack
- **TypeScript / Next.js:** `camelCase` para variables y funciones, `PascalCase` para componentes, tipos e interfaces. Named exports preferidos sobre default (salvo donde Next lo exige). Tipos explícitos en las fronteras públicas (props, retornos de funciones exportadas, DTOs). Evita `any`; usa `unknown` + narrowing.
- **Prisma:** modelos en `PascalCase`, campos en `camelCase`; mapea a la convención de la DB con `@map`/`@@map` (típicamente `snake_case`). Selecciona campos (`select`/`include`) en vez de traer todo.
- **Python:** `snake_case` para funciones y variables, `PascalCase` para clases, type hints siempre. Sigue PEP 8; formatea con el linter del proyecto (ruff), no a mano.
- **Archivos/carpetas:** sigue la convención del framework y del repo; ante duda, revisa archivos vecinos antes de inventar un esquema nuevo.

## Next.js App Router y frontend
- Server Components por defecto; `"use client"` solo en las hojas que necesitan interactividad (estado, eventos, APIs del navegador), nunca en layouts o páginas enteras por comodidad.
- Data fetching en el servidor (RSC / route handlers). Mutaciones vía server actions o route handlers, siempre con validación de entrada y chequeo de autorización (ver skill de arquitectura, sección Seguridad).
- Tailwind: usa la escala del design system (spacing/colores del config); extrae patrones repetidos a componentes, no a cadenas de clases duplicadas ni `@apply` masivo.
- Accesibilidad mínima no negociable: HTML semántico, labels en inputs, foco visible, navegable por teclado.

## Estándar de comentarios (inglés, alto y didáctico)
Comentarios y docstrings **en inglés** por defecto, con densidad alta y didáctica: explican intención, decisiones y el *por qué*, con tono que enseña. (La densidad puede bajarse por proyecto vía su `CLAUDE.md`.)

Excepción: si el repositorio ya tiene una convención documental distinta, respétala — nunca mezcles idiomas dentro de un mismo repo. Si no existe convención, defínela antes de escribir.

Qué comentar:
- **Toda función/módulo público:** docstring o JSDoc con propósito, parámetros, retorno, errores lanzados, y notas de concurrencia/rendimiento si aplican.
- **Intención** donde el "qué" no es evidente; **por qué** en toda decisión no trivial.
- Cuando uses un **patrón de diseño**, nómbralo y explica por qué encaja (didáctico).
- Marca supuestos, restricciones, efectos secundarios, validaciones y transformaciones.
- Presta atención especial a puntos críticos: queries, migraciones, escritura/sincronización de datos, integraciones externas, auth, permisos, auditoría, transacciones y puntos de concurrencia.

Qué NO hacer:
- No narrar líneas obvias (`// increment i` sobre `i++`).
- No repetir en el comentario lo que el nombre ya dice.

Ejemplo:

```typescript
/**
 * Reserves stock for an order using optimistic concurrency control.
 *
 * Why optimistic (not a row lock): under ~100 concurrent checkouts a pessimistic
 * lock on the product row serializes all buyers and becomes the bottleneck. We
 * instead compare-and-swap on a `version` column and retry on conflict, which
 * keeps unrelated products fully parallel.
 *
 * @param productId - Product to reserve.
 * @param qty - Units to reserve; must be > 0.
 * @returns The updated stock level after reservation.
 * @throws {OutOfStockError} If available stock is insufficient.
 * @throws {ConcurrencyError} If retries are exhausted under contention.
 */
async function reserveStock(productId: string, qty: number): Promise<number> {
  // Retry loop: a conflict here means another checkout won the CAS race,
  // not a real error — we re-read and try again with fresh state.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // ...
  }
}
```

## Manejo de errores
- Errores tipados con significado de dominio (`OutOfStockError`), no `throw new Error("algo falló")` genérico ni strings.
- Nunca tragar excepciones: prohibido el `catch` vacío o el que loguea y continúa como si nada. Captura solo donde puedes manejar o traducir el error; el resto, que suba.
- Python: excepciones específicas, nunca `except:` desnudo; `raise ... from e` para preservar la causa.
- API: código de estado correcto + forma de error estable (p. ej. `{ error: { code, message } }`); nunca filtrar stack traces ni detalles internos al cliente.
- Frontend: error boundaries (`error.tsx` en App Router) para fallos de render; estados de error explícitos en la UI, no pantallas colgadas.

## Transacciones e integridad de datos
- Toda operación con múltiples escrituras que deben ser atómicas va en `prisma.$transaction` (interactiva si hay read-then-write). Sin transacción, un fallo a mitad deja estado corrupto.
- Transacciones cortas: nunca llamadas externas (HTTP, colas, webhooks) dentro de una transacción — retienen conexiones y matan la concurrencia.
- La integridad vive en la DB, no solo en la app: unique constraints, foreign keys, checks. La validación de aplicación es UX; la constraint es la garantía real bajo concurrencia.
- Idempotencia + transacción: la clave de idempotencia se verifica e inserta dentro de la misma transacción que el efecto que protege.

## Migraciones (seguridad al escribirlas)
- Revisa siempre el SQL generado por Prisma antes de proponer aplicarlo; el diff del schema no cuenta la historia completa.
- Clasifica: **aditiva** (segura) vs **destructiva** (drop, rename, cambio de tipo con datos). Para destructivas sobre datos vivos, usa expand → migrate → contract: agrega lo nuevo, migra los datos, retira lo viejo en un despliegue posterior.
- Explicita: riesgo de pérdida de datos, incompatibilidad con el código ya desplegado, y estrategia de rollback — incluyendo si el rollback es realmente posible (un drop no se deshace sin backup).

## Fuente de verdad de los datos
Mantén **una sola fuente de verdad por dato**; evita duplicaciones que exijan sincronización manual. Ejecuta cada transformación en la capa que ofrezca mejor integridad, rendimiento y trazabilidad para ese proyecto (ver la tabla de fronteras en la skill de arquitectura).

## Rendimiento y concurrencia (nivel código)
No bloquees el event loop en Node (nada de trabajo pesado síncrono en el request path). Usa async correctamente. Evita N+1 en Prisma (`include`/`select`, batching). Pagina (cursor-based). Asegura índices para los filtros/orderings reales.

## Testing
- Qué se testea primero: lógica de negocio, transformaciones de datos, rutas críticas (dinero, permisos, integridad) y casos borde. No getters triviales ni el framework.
- Pirámide: muchos unit (lógica pura, rápidos), algunos de integración, pocos e2e.
- Integración contra Postgres real (compose de test o testcontainers), no mocks de Prisma: un mock valida tu imaginación del ORM, no el comportamiento real de queries, constraints y transacciones.
- Nombres de test que describen comportamiento ("rejects reservation when stock is insufficient"), no implementación.

## Protocolo al modificar código existente
Explica, proporcional al tamaño del cambio: **problema → causa raíz → modificación → impacto (qué más toca) → cómo validar**. Un fix sin causa raíz identificada es un parche con otro nombre.

## Validación
Toda propuesta ejecutable incluye cómo validarla. Para este stack, por defecto: `pnpm typecheck`, `pnpm lint`, `pnpm build`, tests relevantes; para cambios de datos, revisar el SQL/migración generado.

## Auto-chequeo antes de entregar código
1. ¿Cada función/módulo no trivial tiene su intención documentada en inglés?
2. ¿Los puntos críticos (queries, migraciones, auth, transacciones, concurrencia) tienen comentario de decisión y riesgo?
3. ¿Hay `catch` vacíos, errores genéricos o fronteras sin validación de entrada?
4. ¿Las escrituras múltiples que deben ser atómicas están en transacción?
5. ¿Hay algún comentario que narre lo obvio? Quítalo.
6. ¿Incluí cómo validar el cambio (y tests si toca lógica de negocio)?

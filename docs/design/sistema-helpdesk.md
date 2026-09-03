# Sistema de diseño de HelpDesk

```
ESTADO:      no implementado — no existe contrato de diseño en el código. Lo que hay
             en `coraje-web/` son estilos locales sobre un `AppShell` mínimo, y se
             retira completo. Este documento fija el objetivo, no describe lo vigente
CORTE:       03-sep-2026
EVIDENCIA:   ninguna. Sin validación visual, de teclado, de lector de pantalla ni
             móvil, porque no hay nada que validar todavía
```

**Autoridad:** primera, las decisiones aprobadas para HelpDesk en este documento;
segunda, el contrato universal de diseño y experiencia (skill `diseno-y-experiencia`);
tercera, el comportamiento funcional y el código real verificado.

**Alcance:** solo lo propio de HelpDesk — identidad, tokens concretos, resoluciones y
recetas por vista. Las reglas transversales —jerarquía de acciones, overlays, selección
transaccional, resiliencia, accesibilidad, responsive— viven en la skill universal y
**no se repiten aquí**.

## 1. Punto de partida: rediseño completo

**Decisión aprobada el 03-sep-2026.** Lo visual existente no se migra ni se centraliza
progresivamente: **se rehace**. No hay usuarios cuya costumbre haya que respetar, no hay
pantallas validadas que preservar y la deuda de valores quemados no merece el trabajo de
desmontarse pieza a pieza cuando el resultado va a reemplazarse igualmente.

Consecuencia práctica: la primera vista que se construya **nace consumiendo el
contrato**, no lo adopta después. No existe la fase «primero funciona, luego se
centraliza», porque esa fase es exactamente la que produce lo que ahora se está tirando.

## 2. Identidad

**HelpDesk se lee como una sección de Conecta, no como una aplicación aparte.** Conserva
su barra lateral, cuelga de su URL y no ofrece ningún enlace de «volver»: un enlace de
vuelta lo necesita quien salió de un sitio, y aquí el usuario no debe sentir que salió
de ninguna parte (`contexto-canonico.md` §1.1).

> **Impulsa no es la referencia de este apartado.** Tenía *Volver a Conecta* en el pie
> de su sidebar porque se planteó como módulo y luego se despegó. HelpDesk va en
> dirección contraria: **el shell que se replica es el de Conecta**, no el de Impulsa.
> De Impulsa se toman las **maneras** —cadena de autoridad, tokens, recetas—, no la
> apariencia ni la navegación.

Comparten, eso sí, marca corporativa: el logotipo vive en `public/rb-logo.png` en ambos
repositorios.

> `ABIERTO` **El shell de Conecta no ha sido inspeccionado por este contrato.** Antes de
> materializar tokens hay que ver su barra lateral, su tipografía y su paleta reales, y
> decidir si se replican o se consumen. Es la misma decisión pendiente que el mecanismo
> de integración de `contexto-canonico.md` §1.1, y bloquea al mismo trabajo.

**Personalidad:** precisa · adulta · sobria · operativa · confiable. Nace del orden y el
ritmo, **no de saturar color o negrilla**.

Diferencia de tono respecto a Impulsa, y es real: Impulsa es documental y pausada —se
prepara una solicitud, se revisa, se despacha—. Una mesa de ayuda es **una cola**. Su
pantalla principal es una bandeja que alguien mira muchas veces al día, donde importan
la densidad, el escaneo rápido y la señal de urgencia. El sistema debe optimizar para
**leer muchas filas y decidir rápido**, no para redactar con cuidado.

> `ABIERTO` **Acento del módulo.** Impulsa usa teal como acento sobre navy corporativo.
> HelpDesk necesita distinguirse dentro de Conecta sin romper la marca compartida. Las
> dos salidas son un acento propio dentro de la paleta corporativa, o el mismo acento
> con distinción por iconografía y topbar. **Sin decidir**, y conviene decidirlo antes
> de materializar el tema, no después.

> `DECISIÓN` **Tipografía.** Se adopta **Lato**, la fuente corporativa ya confirmada en
> Impulsa. No hay razón para que dos módulos de la misma plataforma tipografíen
> distinto. **Con la corrección de su deuda conocida:** hay que cargar pesos reales
> 400/500/600/700 desde el principio, porque Impulsa carga solo 400 y 700 y el navegador
> sintetiza los intermedios, que es un defecto visible.

## 3. Cadena de autoridad del contrato

```
fundamentos y tema → variables CSS semánticas → recetas universales
  → componentes universales → patrones de dominio → vistas
```

**Una capa inferior no redefine decisiones que pertenecen a una capa superior.**

Antes de introducir un valor visual directo, inspeccionar el contrato centralizado. Si
la autoridad no existe, **crearla o ampliarla en el núcleo y después consumirla.**

> **`INVARIANTE`** Ningún valor visual se escribe directamente en una vista: ni color,
> ni espaciado, ni tipografía, ni radio, ni sombra, ni breakpoint, ni duración. Esto
> **incluye al propio sistema de diseño**: un valor quemado en un archivo aislado dentro
> de esa carpeta es la misma violación, solo que más difícil de encontrar.

**Dos adaptadores, una decisión.** El tema se expresa en TypeScript para las recetas y
el código de servidor, y en CSS para Tailwind y el navegador. Son dos materializaciones
de la misma decisión, y **divergen en silencio** salvo que algo lo impida: Impulsa
sostiene la coherencia con un validador ejecutable. Aquí hace falta desde el principio,
porque la divergencia no produce un error, produce una pantalla ligeramente distinta que
nadie sabe explicar.

## 4. Estructura del contrato

La estructura se toma de Impulsa por estar probada, con los nombres adaptados:

| Capa | Contenido |
|---|---|
| `foundations/` | Primitivas de marca, contrato semántico, tipografía, movimiento |
| `themes/` | Asignación concreta de HelpDesk al contrato semántico |
| `recipes/` | Composiciones reutilizables: control, campo, superficie, texto, insignia |
| `components/` | Componentes universales que consumen recetas |
| `patterns/` | Patrones de dominio: bandeja, detalle de ticket, portal |
| `utilities/` | Utilidad de composición de clases |

El contrato semántico son **referencias a variables CSS**, no valores. Así el mismo
token vale para una receta de TypeScript y para una clase de utilidad, con una sola
fuente en tiempo de ejecución.

> **Regla dura heredada:** los controles nativos heredan **solo la familia
> tipográfica**. **No usar `font: inherit`**, que restablece tamaño, peso y altura de
> línea definidos por las recetas.

## 5. Semántica de color propia del dominio

Lo que un helpdesk necesita y una plataforma documental no:

| Familia | Función | Restricción |
|---|---|---|
| Estado del ticket | Distinguir los estados de `specs/tickets.md` §4 | Un color por estado, **derivado del vocabulario único**, no inventado por vista |
| Prioridad | Señalar urgencia en una fila escaneada | Solo `ALTA` merece color saturado. Si todo urge, nada urge |
| SLA | Vencido, por vencer, en plazo | **Solo con condición semántica real**, calculada en servidor |
| Éxito / advertencia / error | Retroalimentación de acciones | Nunca como decoración |

> **`INVARIANTE`** El color de estado se resuelve desde **una sola autoridad** que
> traduce el vocabulario de estados a token. Dos vistas que asignen color a estados por
> su cuenta divergen en la primera adición, y el usuario aprende dos códigos de color
> para el mismo dato.

## 6. Vistas que el contrato tiene que sostener

| Vista | Exigencia dominante |
|---|---|
| Bandeja interna | **Densidad y escaneo.** Muchas filas, orden, filtros, estado y SLA legibles de un vistazo |
| Detalle del ticket | Conversación con visibilidad distinguible: la nota interna **no puede parecerse** a la respuesta al cliente |
| Redirección / clasificación | Decisión rápida y repetitiva: teclado antes que ratón |
| Portal del cliente | Sobrio, sin jerga interna, sin estados técnicos |
| Acceso y OTP | Superficie pública sobria, con acción explícita, sin activación automática |

> La distinción visual entre nota interna y respuesta al cliente es **la más cara de
> equivocar** de toda la interfaz: un agente que confunde una con otra le escribe al
> cliente lo que no debía. No se resuelve con un matiz de color.

## 7. Matriz de resoluciones

| Resolución | Uso |
|---|---|
| 1440 × 900 | Validación principal de productividad |
| 1280 × 720 | Densidad y altura útil |
| 1024 × 576 | Estrés operativo |
| Móvil | **Prioridad real, no cortesía**: el portal del cliente se abrirá desde el teléfono |

## 8. Orden de implementación

1. Formalizar el **contrato técnico ejecutable**: fundamentos, tema, validador de
   coherencia entre los dos adaptadores.
2. Construir la **primera vista nueva** —bandeja o acceso— como primer consumidor, sin
   valores locales.
3. Extraer a recetas y componentes lo que la segunda vista repita. **No antes:** un
   componente extraído de un solo uso codifica una casualidad.
4. Retirar `AppShell` y los estilos actuales al construir el shell nuevo.

> Ninguna regla se considera implementada hasta que componentes y vistas consuman el
> contrato y superen validación real.

---

## 9. Verificación contra código

Sin implementación; la tabla queda escrita para la unidad que la construya.

| # | Afirmación a verificar | Dónde comprobarlo |
|---|---|---|
| V1 | Lato carga pesos reales 400/500/600/700, sin síntesis | Configuración de fuentes |
| V2 | Existe contrato ejecutable con capas separadas | Árbol del sistema de diseño |
| V3 | No hay valores quemados en vistas | `grep` de hex, px y clases arbitrarias fuera del contrato |
| V4 | Los dos adaptadores del tema no divergen | Validador de coherencia |
| V5 | El color de estado se resuelve desde una sola autoridad | Módulo de traducción estado→token |
| V6 | Ningún control usa `font: inherit` | `grep` |
| V7 | La nota interna y la respuesta al cliente son inequívocas | Validación visual del detalle del ticket |
| V8 | El portal es operable en móvil, teclado y lector de pantalla | Validación real, no inspección |

**Changelog:** 03-sep-2026 — línea base. Declara el rediseño completo y la ausencia de
fase «primero funciona, luego se centraliza» (§1); adopta Lato corrigiendo su deuda de
pesos y deja abierto el acento del módulo (§2); adapta la cadena de autoridad y la
estructura de capas de Impulsa (§3, §4); introduce la semántica de color propia de una
mesa de ayuda y la autoridad única de color de estado (§5).

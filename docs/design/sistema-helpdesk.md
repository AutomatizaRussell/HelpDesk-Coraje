# Sistema de diseño de HelpDesk

```
ESTADO:      contrato ejecutable construido (U5). `coraje-web/src/design-system/`
             (fundamentos, tema, recetas, componentes y patrones: shell de
             Conecta, barra propia, navegación de HelpDesk, menú de usuario) y el
             adaptador CSS en `src/app/globals.css`. Consumidores: `/` en sus dos
             modos de entrada, y `/login`. La bandeja y el detalle del ticket no
             existen (U7)
CORTE:       24-sep-2026
EVIDENCIA:   `pnpm test` 61/61 (8 del contrato, que fallan al forzar divergencia
             entre adaptadores y una clase prohibida), `tsc --noEmit`, `eslint` y
             `next build` limpios; utilidades con nombre comprobadas en el CSS
             compilado. Shell de Conecta revisado por el usuario en producción
             (23 y 24-sep). **Sin validación de teclado, de lector de pantalla ni
             móvil**, y el modo directo sin ver todavía
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

> `DECISIÓN` **Diseño propio (23-sep-2026, usuario).** HelpDesk tiene un diseño
> **completamente distinto** del de Conecta y del de Impulsa:
>
> - **De Conecta se replica solo el shell** —su sidebar, y su topbar si se conserva—,
>   para que la navegación entre módulos se lea continua. Nada más: ni pesos, ni
>   tipografía, ni superficies, ni recetas. Conecta usa pesos 800/900 que no encajan
>   con la sobriedad buscada y ni siquiera carga Lato (renderiza la fuente del
>   sistema); HelpDesk carga Lato aunque Conecta no lo haga.
> - **De Impulsa se toma lo conceptual** —cadena de autoridad, contrato semántico como
>   referencias a variables CSS, dos adaptadores con validador, capas del §4—, **no su
>   apariencia**. Inspirarse no es copiar: una receta de Impulsa no se trae calcada.
>
> Esto corrige el criterio anterior de `CLAUDE.md` según el cual apartarse de las
> vistas de Impulsa exigía justificación: la justificación ahora la exige parecerse.

> `DECISIÓN` **Navegación (23 y 24-sep-2026, usuario).** Dos modos según por dónde se
> entra (`specs/integracion-conecta.md` §2):
>
> - **Desde Conecta** (`patterns/conecta-shell/`): réplica del shell de Conecta.
>   - **Columna replegada** navy de 80 px con el **isotipo blanco** arriba, como en
>     Conecta, y los iconos de su menú. Cada icono es un `<a href>` a Conecta: carga
>     completa, nunca `navigate()` de su router.
>   - **Topbar** blanca y sin franja, de 64 px (84 en escritorio), **sin logotipo**:
>     la marca va en el sidebar, como en Conecta.
>   - **Sidebar desplegado** con el logotipo blanco. Se **superpone** al contenido en
>     lugar de empujarlo, para que la bandeja no cambie de ancho.
>   - Los datos de la persona (nombre corto, área, «Mis clientes») salen del perfil de
>     Conecta cotejado en servidor.
> - **Directo** (`patterns/app-shell/StandaloneShell.tsx`): barra propia de HelpDesk
>   con el logotipo azul y su espacio libre (72 px, 84 en escritorio), y el avatar con su
>   menú. Nada de Conecta.
> - **Navegación propia de HelpDesk** (`patterns/module-nav/`), igual en los dos modos:
>   fila de pestañas bajo la barra superior. Horizontal y no un segundo sidebar, para no
>   quitarle 250-300 px a la bandeja. La pestaña activa lleva el subrayado del acento;
>   hoy solo existe «Inicio» (`features/shell/helpdesk-sections.ts`).
>
> `ABIERTO` **Retirar la topbar** en modo Conecta. Queda para después. Dato para
> decidirlo: topbar y pestañas ocupan 108 px en móvil y 128 en escritorio.
>
> **Fuente de la réplica:** RBGCT-REACT, verificada el 24-sep-2026 con acceso de
> lectura. `main`, `stiben` y `lulox` apuntan las tres a `cb06681` (21-sep-2026), y el
> fragmento de JS desplegado en producción contiene los mismos valores
> (`text-[13px]`, `w-56 md:w-64 lg:w-72 xl:w-80`, `acceso_sqf`). La primera versión que se
> tomó, con sidebar blanco, era un `main` antiguo (`e27662b`) reescrito después con
> *force push*.
>
> **Diferencias deliberadas con Conecta:**
> - El sidebar desplegado se superpone al contenido en lugar de empujarlo.
> - El logotipo del sidebar va a 130/150/170/190 px según el ancho, siempre con su
>   espacio libre. Conecta pone 170 px ya en el sidebar de 224 px.
> - Las etiquetas de sección van en blanco al 60 %, no al 45 %: al 45 % dan 4,2:1,
>   por debajo de AA.
> - La tipografía es Lato, no Inter (decisión del usuario): se ve algo más pequeña.
>   Los pesos 500, 600 y 800 pasan a 400, 700 o 900.
> - «Formación» no aparece: sus cursos solo los calcula el backend de Conecta
>   (`specs/integracion-conecta.md` §5).
> - No se replican la campana, el botón flotante de sugerencias ni el pie de
>   contactos: son funciones de Conecta, no del shell.
> - HelpDesk figura en «Recursos» como ítem activo.

**Marca corporativa.** La fuente de verdad es el *Manual de Marca Corporativa* de
Russell Bedford (inspeccionado el 23-sep-2026). Lo que obliga a este contrato:

- **Logotipo e isotipo oficiales** del paquete de marca, recortados solo del margen
  transparente:
  - `public/rb-logo.png`: imagotipo azul, para la barra propia y el acceso;
  - `public/rb-logo-white.png`: imagotipo blanco, para el sidebar navy;
  - `public/rb-isotype-white.png`: isotipo blanco, para la columna replegada.

  El archivo anterior era una versión no oficial de navy apagado, y el manual prohíbe
  versiones anteriores o alternativas.
- **Espacio libre** alrededor del logotipo de al menos el 20 % de su ancho, y **ningún
  texto que se lea junto a él**: el nombre «HelpDesk» no forma bloque con el logo.
- **El isotipo (globo) no es logotipo por sí mismo**, según el manual (§4.1), solo motivo
  decorativo. `DECISIÓN` **Desviación consciente (24-sep-2026, usuario):** la columna
  replegada lo muestra, como hace Conecta, para que el shell sea idéntico. El logotipo
  completo aparece al desplegar el sidebar.
- **Ancho mínimo de 30 mm** (≈113 px a 96 ppp).
- **Cinco colores aprobados** y sus tintas al 80/60/40/20 %, para los cinco (no solo
  navy y naranja). Sky Blue se toma por su hex `#00a9ce`: el RGB del manual es un error
  de copia.
- **Cada color de la paleta identifica además un área de la firma** (naranja →
  Revisoría, teal → BPO, magenta → Contaduría; navy probablemente Administración —
  `ABIERTO`, sin confirmar—). Como HelpDesk lo usa toda la firma, **puede usar los cinco
  colores**, pero con contención: usar muchos colores porque sí da una interfaz de
  feria, no sobria. Si algún elemento llega a representar un área concreta, el mapeo
  área→color se confirma con el usuario antes de materializarlo; no se infiere.

**Personalidad:** precisa · adulta · sobria · operativa · confiable. Nace del orden y el
ritmo, **no de saturar color o negrilla**.

Diferencia de tono respecto a Impulsa, y es real: Impulsa es documental y pausada —se
prepara una solicitud, se revisa, se despacha—. Una mesa de ayuda es **una cola**. Su
pantalla principal es una bandeja que alguien mira muchas veces al día, donde importan
la densidad, el escaneo rápido y la señal de urgencia. El sistema debe optimizar para
**leer muchas filas y decidir rápido**, no para redactar con cuidado.

> `DECISIÓN` **Acento del módulo (D5, resuelta el 23-sep-2026 por el usuario):
> HelpDesk lleva acento visual propio.** Se descarta la salida de compartir el acento
> de Impulsa y distinguir solo por iconografía y topbar.
>
> Lo que la decisión fija y lo que no: fija que el tema declara **un acento distinto
> del de Impulsa**; no fija cuál.
>
> **Corrección (23-sep-2026):** este bloque decía «distinto del teal de Impulsa». Era
> falso: el acento de Impulsa es **naranja** (`themes/impulsa.ts`: foco y acción
> primaria); el teal solo tiñe un caso de asociación. Confirmado por el usuario.
>
> Restricciones del acento, no negociables: vivir dentro de la paleta corporativa, con
> contención cromática (cualquiera de los cinco colores cabe, no todos a la vez); y
> reservar el registro de alerta para la señal de urgencia de la bandeja, que en una
> mesa de ayuda es información y no decoración. Un acento que compita con esa señal hace
> más daño que uno poco distintivo.
>
> `PROPUESTA` **Acento concreto (U5, 23-sep-2026, pendiente de ver en pantalla):
> Sky Blue**, con navy como color de acción y de foco. El registro cálido (ámbar,
> rojo) queda reservado para SLA y urgencia, y un acento frío no compite con él. Límite
> duro: Sky Blue da 2,8:1 sobre blanco, así que solo sirve de **marca** (pestaña activa,
> barra de selección, su tinta al 20 % como fondo de selección). Nunca va en texto, en
> el anillo de foco ni como único indicador de un estado. El foco es navy porque
> necesita 3:1 (WCAG 1.4.11). Materializado en `themes/helpdesk.ts`; se revisa con la
> primera vista que lo use de verdad.

> `DECISIÓN` **Tipografía: Lato, pesos 400 · 700 · 900.** Son los cortes que aprueba
> el manual (Regular, Bold, Black, además de Italic) y los únicos que
> `next/font/google` sirve en el rango útil (`100, 300, 400, 700, 900`). La itálica
> no se carga todavía: next/font precarga cada archivo declarado, y hoy el único texto
> en itálica (el eslogan) va dentro de la imagen del logotipo.
>
> **Corrección (23-sep-2026):** este bloque exigía cargar 400/500/600/700. No es
> posible —Lato 1.x no tiene 500 ni 600 en Google Fonts— y el diagnóstico era erróneo:
> el navegador no sintetiza pesos intermedios, pinta el disponible más cercano. El
> defecto real de Impulsa es que su código pide `font-medium`/`font-semibold` sin que
> existan. La corrección es que el contrato **solo exponga los pesos que se cargan**, y
> que una prueba falle si aparece un peso sin corte real.

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
4. ~~Retirar `AppShell` y los estilos actuales al construir el shell nuevo.~~
   **Hecho el 22-sep-2026 (U4), y antes de tiempo a propósito:** se retiró sin esperar
   al shell nuevo, porque mantenerlo en pie invitaba a construir encima de él. El paso
   deja de ser una tarea y pasa a ser una condición ya cumplida — el shell nuevo se
   construye sobre nada, no sobre lo anterior.

> Ninguna regla se considera implementada hasta que componentes y vistas consuman el
> contrato y superen validación real.

---

## 9. Verificación contra código

Estado al 23-sep-2026 (U5, cambios locales sin publicar). «Verificado» significa prueba automática en verde o inspección del artefacto compilado; nada de esta tabla se ha visto todavía en un navegador.

| # | Afirmación a verificar | Dónde comprobarlo | Estado |
|---|---|---|---|
| V1 | Lato carga 400/700/900, y ninguna clase pide un peso sin corte (`font-medium`, `font-semibold`, `font-extrabold`, `font-thin`, `font-light`) | `layout.tsx` + `contract.test.mts` | **Verificado:** prueba del literal de `layout.tsx` contra `LATO_WEIGHTS`; el CSS compilado solo trae `@font-face` de 400/700/900 y ninguna regla `.font-semibold`. La itálica se difiere hasta que una vista la use |
| V1b | `public/rb-logo.png` es el imagotipo oficial azul oscuro, recortado solo del margen transparente (2422×526, opaco en `#001871`) | Dimensiones y color dominante del archivo | **Verificado** al recortarlo (System.Drawing: límites alfa y color opaco dominante) |
| V2 | Existe contrato ejecutable con capas separadas | `coraje-web/src/design-system/` | **Verificado:** `foundations/`, `themes/`, `recipes/`, `components/`, `patterns/`, `utilities/` |
| V3 | No hay valores quemados en vistas | Barrido de `contract.test.mts` sobre todo `src/` | **Verificado:** 10 detectores (hex, funciones de color, px, clases arbitrarias, z/duración numéricos, paleta por defecto, pesos, `font: inherit`, tamaño de icono, `style` en línea), cada uno con su prueba positiva y negativa; comprobado además forzando una violación en `page.tsx` |
| V4 | Los dos adaptadores del tema no divergen | `contract.test.mts` | **Verificado:** igualdad de claves y de valores; falla al forzar un valor distinto y una variable solo en CSS. Además, toda `var(--hd-…)` del código debe existir |
| V5 | El color de estado se resuelve desde una sola autoridad | Módulo de traducción estado→token | Pendiente: no hay vista con estados (U7) |
| V6 | Ningún control usa `font: inherit` | Detector del barrido | **Verificado** |
| V7 | La nota interna y la respuesta al cliente son inequívocas | Validación visual del detalle del ticket | Pendiente (U7) |
| V8 | El portal es operable en móvil, teclado y lector de pantalla | Validación real, no inspección | Pendiente: no hay portal (U8) |

**Changelog:** 03-sep-2026 — línea base. Declara el rediseño completo y la ausencia de
fase «primero funciona, luego se centraliza» (§1); adopta Lato corrigiendo su deuda de
pesos y deja abierto el acento del módulo (§2); adapta la cadena de autoridad y la
estructura de capas de Impulsa (§3, §4); introduce la semántica de color propia de una
mesa de ayuda y la autoridad única de color de estado (§5).
- 23-sep-2026 — **el punto de partida queda en blanco y D5 se cierra.** U4 retiró el
  frontend heredado completo (`AppShell`, tokens de `globals.css`, tipografía de
  plantilla del layout), así que el paso 4 de §8 deja de ser tarea y pasa a ser
  condición cumplida: el shell nuevo se construye sobre nada. El usuario resuelve D5 —
  **acento visual propio**, no compartido con Impulsa—; qué acento exactamente sigue
  siendo trabajo de `U5`, con las tres restricciones de §2.
- 23-sep-2026 (mismo día) — **inspeccionado el Manual de Marca Corporativa y el shell de
  Conecta.** Diseño propio: de Conecta solo el shell, de Impulsa solo lo conceptual
  (§2). Sidebar replegado; topbar posiblemente sustituida por navegación superior
  propia, abierto. Logotipo oficial. Se corrigen dos premisas falsas de §2: el acento de
  Impulsa es naranja, no teal, y Lato no tiene 500/600 — pesos 400/700/900. Los cinco
  colores son utilizables porque HelpDesk es de toda la firma, con contención; el uso
  semántico por área exige confirmar antes el mapeo con el usuario.

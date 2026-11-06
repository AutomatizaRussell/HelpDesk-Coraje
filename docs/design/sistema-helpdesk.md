# Sistema de diseño de HelpDesk

```
ESTADO:      contrato ejecutable construido (U5). `coraje-web/src/design-system/`
             (fundamentos, tema, recetas, componentes y patrones: shell de
             Conecta, barra propia, navegación de HelpDesk, menú de usuario) y el
             adaptador CSS en `src/app/globals.css`. Consumidores: `/login`, y desde
             U7 (corte 18, sin desplegar) la bandeja, la creación y el detalle del
             ticket, con recetas de campo, superficie e insignia
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
>   - El nombre corto y los módulos de Conecta que deciden su menú salen del perfil de
>     Conecta cotejado en servidor.
> - **Directo** (`patterns/app-shell/StandaloneShell.tsx`): barra propia de HelpDesk
>   con el logotipo azul y su espacio libre (72 px, 84 en escritorio), y el avatar con su
>   menú. Nada de Conecta.
> - **Navegación propia de HelpDesk** (`patterns/module-nav/`), igual en los dos modos:
>   desde U32, **dentro de la barra superior** y solo si hay más de una sección
>   (`features/shell/helpdesk-sections.ts`). Horizontal y no un segundo sidebar, para no
>   quitarle 250-300 px a la bandeja. La activa lleva el subrayado del acento.
>
> `DECISIÓN` (04-nov-2026, U32) La topbar de Conecta **se conserva, mínima**: §5.7.
>
> **Fuente de la réplica:** el `main` de RBGCT-REACT en el commit que fija
> `patterns/conecta-shell/conecta-upstream.json`; `pnpm conecta:diff` muestra qué
> cambió desde entonces (`specs/integracion-conecta.md` §6.1). Al 06-nov-2026, `483a92a`,
> con el rediseño del shell del 04-nov-2026: ítem activo en pastilla blanca, sin tarjeta
> de la persona ni etiqueta del panel, y un pie con la franja Sea Green, el lema y el
> globo como marca de agua. El CSS desplegado en producción ese día ya tenía la
> pastilla. La primera réplica (24-sep-2026) salió de `cb06681`; antes se tomó un `main`
> antiguo (`e27662b`), reescrito después con *force push*.
>
> **Diferencias deliberadas con Conecta:**
> - El sidebar desplegado se superpone al contenido en lugar de empujarlo.
> - El logotipo del sidebar va a 130/150/170 px según el ancho, siempre con su
>   espacio libre. Conecta pone 170 px ya en el sidebar de 224 px.
> - En pantallas bajas (≤ 720 px de alto), Conecta oculta el lema y encoge el globo
>   del pie. Aquí no: una consulta de medios no puede consumir un token del contrato, y
>   el menú del diálogo se desplaza, así que nada queda fuera de alcance.
> - «Analitica» no aparece en los accesos rápidos: Conecta solo la muestra si se
>   compiló con su dirección (`VITE_EEFF_URL`), que no se conoce desde aquí.
> - Las etiquetas de sección van en blanco al 60 %, no al 45 %: al 45 % dan 4,2:1,
>   por debajo de AA.
> - La tipografía es Lato, no Inter (decisión del usuario): se ve algo más pequeña.
>   Los pesos 500, 600 y 800 pasan a 400, 700 o 900.
> - «Formación» no aparece: sus cursos solo los calcula el backend de Conecta
>   (`specs/integracion-conecta.md` §5).
> - No se replican la campana, el botón flotante de sugerencias ni el pie de
>   contactos: son funciones de Conecta, no del shell.
> - Barra de desplazamiento: la de Conecta (6 px, pulgar `#cbd5e1`), en toda la app.
> - El ítem activo es «Auto gestión»: el acceso a HelpDesk irá en esa vista de Conecta,
>   no en su menú. Se construye cuando HelpDesk esté listo (decisión del 24-sep-2026).
>   El código no lo marcaba desde `ed0bd1d`; corregido el 06-nov-2026.
> - **El foco con teclado se ve**, en blanco sobre el navy. Los ítems de Conecta llevan
>   `focus:outline-none` sin reemplazo, un defecto de accesibilidad (WCAG 2.4.7) que no
>   se replica. Solo aparece al usar el teclado, así que con el ratón no cambia nada.
> - Se replica solo el menú del **empleado**. Conecta muestra otro distinto a
>   administradores, editores y superadministradores (`sidebarConfig.js`), pero sus
>   secciones de administrador no tienen URL: `AdminDashboard.jsx` guarda la sección en
>   el estado de React, y el editor solo traduce algunas rutas antiguas. Desde HelpDesk,
>   todos esos enlaces caerían en la portada del panel. Queda así hasta que Conecta dé
>   una URL a cada sección (06-nov-2026).

**Marca corporativa.** La fuente de verdad es el *Manual de Marca Corporativa* de
Russell Bedford (inspeccionado el 23-sep-2026). Lo que obliga a este contrato:

- **Logotipo e isotipo oficiales** del paquete de marca, recortados solo del margen
  transparente. Los originales (2422 px) viven en `docs/design/marca/`; en
  `coraje-web/public/` hay derivados al doble del mayor ancho en pantalla, en PNG de
  256 colores (U27), porque la app los sirve sin optimizador:
  - `public/rb-logo.png` (400 px): imagotipo azul, para la barra propia y el acceso;
  - `public/rb-logo-white.png` (400 px): imagotipo blanco, para el sidebar navy;
  - `public/rb-isotype-white.png` (108 px, el triple): isotipo blanco, para la columna
    replegada.

  Un token de ancho que crezca por encima de la mitad del archivo exige regenerar el
  derivado desde el original; `brand-assets.test.mts` falla si no.

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

> `DECISIÓN` **Corrección de la personalidad (03 y 04-nov-2026, usuario, U30).** El
> criterio anterior se cumplió al pie de la letra y produjo una interfaz plana que las
> personas que la usan y el propio usuario leen como «hecha por IA». Se mantiene la
> sobriedad en **lo que se trabaja** (la tabla, los formularios, el detalle) y se le da
> voz a **lo que recibe**: una cabecera en el color del área de quien entra, cifras
> grandes en Lato Black que cuentan hasta su valor, el globo de la marca como motivo,
> movimiento lento y escaso, y estados vacíos con dibujo. Concreción en §5.4.

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

### 5.1 `DECISIÓN` (01-oct-2026, U16) Color por área

El manual de marca (§3.2) reserva los colores complementarios «para representar las
diferentes áreas que conforman a la firma». La asignación la dio el usuario:

| Área | Color | Hex |
|---|---|---|
| REVISORÍA (Auditoría y Revisoría Fiscal) | Earth Orange | `#ed8b00` |
| CONTABILIDAD | Mind Magenta | `#981d97` |
| BPO | Sea Green | `#00bfb3` |
| LEGAL | Space Blue | `#001871` |
| ADMINISTRACIÓN, ADMINISTRACIÓN-RECEPCIÓN, IMPUESTOS, sin área o área nueva | Sky Blue | `#00a9ce` |

Dos usos con significado distinto:

- **El acento de la interfaz sigue el área de quien entra** (con suplantación, la de la
  persona suplantada): pestaña y selección activas, avatar y número de la campana. El
  shell pone `data-area` en su raíz y `globals.css` redefine `--hd-color-accent*`.
- **El punto de la columna «Área y tipo» y del detalle sigue el área del ticket**
  (`AreaName`).

Lo que **no** cambia con el área: el navy del shell y de los botones, y los colores de
estado. «Asignado» y «Requiere tu atención» pasan del acento a un token `info` fijo:
un estado se ve igual para todos. El color pleno nunca es texto (naranja, Sea Green y
Sky Blue no llegan a 4,5:1 sobre blanco); la tinta sobre él es navy o blanca según el
área. `area-palette.test.mts` mide los contrastes. Riesgo aceptado: en Revisoría el
acento naranja convive con el ámbar de «por vencer», que sigue siendo otro token.

Pendiente y no comprometido: la hamburguesa no toma el color del área, porque
atenuada no alcanza 3:1; la sidebar, último paso si se decide.

### 5.2 `DECISIÓN` (01-oct-2026, U17) Modo Coraje

> **13-oct-2026 (U20):** se llama modo **Externo**. Donde abajo dice `coraje`, el código
> dice `externo`: `data-mode="externo"`, la clave `externo` del tema, las variables
> `--hd-externo-*` y `externo-palette.test.mts`. Los colores no cambian.

El trabajo con clientes (`specs/tickets.md` §13) cambia el **marco**, no el contenido:
la barra superior y la fila de pestañas pasan a navy, continuando la columna de
Conecta, y el lienzo se tiñe apenas de azul (`#edf0f8`). Tarjetas, texto, botones,
estados y acentos de área siguen igual. El shell pone `data-mode="coraje"` en su raíz y
`globals.css` redefine, con el mismo nombre, cada variable que cambia (`coraje` en el
tema): ninguna vista sabe en qué modo está.

- **Primera versión, retirada el mismo día tras verla:** lienzo y tarjetas en navy,
  como un modo oscuro. Pesaba, tarjeta y lienzo apenas se separaban (1,2:1) y cambiaba
  todo, en contra de «que en esencia cambie poco».
- **La topbar** usa variables propias (`shell.topbarInk`, `topbarFocus`): sus menús
  cuelgan de ella y no deben volverse navy. **La fila de pestañas** (`data-shell-band`)
  recibe redefinidos los tokens de siempre solo dentro de ella. La barra propia usa el
  logotipo blanco.
- **Legal y Contabilidad**, solo en este modo, toman su tinta aprobada más clara como
  acento (navy al 40 %, magenta al 60 %): sobre navy su color pleno da 1:1 y 2,2:1. El
  punto del área del ticket no cambia, porque está sobre blanco.
- **Transición:** lienzo y barras cambian de color con `--hd-motion-normal`; el
  movimiento reducido la anula.

`coraje-palette.test.mts` exige cada clave en el tema base, los tres bloques CSS
completos y los contrastes (texto ≥ 4,5:1; acentos y foco ≥ 3:1).

### 5.3 `DECISIÓN` (03-nov-2026, U29) Toast para confirmar

Decisión del usuario: el aviso que confirma lo que acaba de pasar («Ticket creado y
asignado a…») aparece en una esquina un momento y se va solo.
`design-system/patterns/toast/Toaster.tsx`:

- **Solo confirmaciones.** Un error, o la advertencia de un correo que no salió, se
  queda junto a la acción: pide hacer algo, y un toast se iría antes.
- Usa la receta `notice` con `shadow-overlay`; entra con `animate-toast-in`
  (`--hd-motion-normal`, `--hd-motion-easing`, recorrido `--hd-motion-toast-offset`) y se
  apila sobre el shell (`--hd-layer-toast`), con el ancho de `--hd-size-toast`. Con
  movimiento reducido, la entrada es instantánea.
- Región `status` con `aria-live`: se anuncia sin mover el foco. Cada uno se cierra
  antes de tiempo con su ×; dura 6 s.
- `FormFeedback` lo usa para todo éxito de formulario dentro de `AppFrame`; fuera (el
  portal), el mensaje sigue en línea. Los avisos que llegan por la URL (ticket
  redirigido) usan `FlashToast`, que además limpia el parámetro. *Desde U31, «ticket
  creado» ya no es un toast:* la ventana confirma con el código (§5.5), porque el
  código es lo que la persona necesita a mano y un aviso que se va no se copia.

### 5.5 `DECISIÓN` (04-nov-2026, U31) Crear un ticket

Maqueta aprobada por el usuario («T»). `features/tickets/CreateTicketForm.tsx`:

- **La ventana entera toma el color del área elegida** (`useFormDialogTone`, corte 63,
  pedido del usuario al verla): franja superior, encabezado en la tinta con «Llegará a
  …» bajo el título, y la selección de área y prioridad en su acento. El cuerpo sigue
  blanco. Los nombres de área se leen sin las mayúsculas del directorio
  (`areaDisplayName`), y la ventana usa menos Black y menos versalitas (la primera
  versión, con una franja aparte, se veía sobrecargada).
- **Áreas como tarjetas** (radios nativos ocultos, con el recuadro y el código del
  área); tipo, categoría y subcategoría en una fila. La redirección conserva el
  desplegable (`areaPicker`).
- **Prioridad en tarjetas** con el día en que vencería un ticket creado hoy. Lo calcula
  `core.add_colombia_business_days`, la misma función que fija el plazo; si la consulta
  falla, la tarjeta muestra solo los días y la creación sigue.
- **Adjuntos** en una zona para elegir o soltar archivos; cada archivo con el recuadro
  de su tipo, su barra de progreso (`<progress>`) y su estado. Vale también para el
  cuadro de escritura del detalle.
- **Confirmación** en lugar del formulario: el área que lo recibió, quién quedó como
  responsable, el código grande con «Copiar», y «Crear otro» o «Ver el ticket». La
  bandeja de detrás ya trae el ticket nuevo.
- **Solo en la ventana** (decisión del usuario, 04-nov-2026, corte 79): abrir o recargar
  `/tickets/nuevo` directamente lleva a la bandeja; ya no hay versión a página completa.
  Con algo escrito, recargar o cerrar la pestaña pide confirmación al navegador
  (`beforeunload`); creado el ticket, ya no la pide (`useFormDialogSettled`).

`DECISIÓN` (04-nov-2026, U33) **Forma compacta**, elegida por el usuario entre tres
maquetas (compacta, dos columnas, dos pasos). La ventana medía unos 1.090 px de alto en
escritorio y 1.460 en móvil, calculados desde las recetas: en un portátil pedía
desplazarse casi el doble de lo visible. Sustituye, en crear, las tarjetas de área y de
prioridad y la zona de adjuntos de arriba:

- **Áreas en chips** (radios nativos ocultos, con el recuadro y el código del área), sin
  texto de ayuda: al elegir, el encabezado dice «Llegará a …».
- **Prioridad en una fila** de opciones del mismo ancho: nombre, días y día de
  vencimiento; en móvil, nombre y día en dos líneas.
- Las ayudas de prioridad y descripción van en la línea de su etiqueta; la descripción
  abre con cuatro filas.
- **Adjuntar archivos** y **Observadores** son dos botones en una fila. Los archivos van
  en chips con su estado (barra, tamaño y marca, alerta) y el error de cada uno en texto
  debajo; se pueden soltar en todo el bloque (`AttachmentPicker`, `layout="compact"`).
  El botón de observadores muestra cuántos hay elegidos y abre el panel; plegado con
  `hidden`, la selección se sigue enviando.
- En móvil, con el área elegida, el pie omite «Lo recibe …» para caber en una fila.

Estimado: unos 650 px en escritorio y 760 en móvil, sin medir en navegador. Sin tokens
nuevos. El cuadro de escritura del detalle conserva la zona grande (`layout="zone"`).

### 5.4 `DECISIÓN` (04-nov-2026, U30) Cabecera del área

Elegida por el usuario entre catorce direcciones de una maqueta (la «N»).
`design-system/patterns/area-hero/`:

- **Fondo en la tinta del área al 20 %**, franja superior y disco en su color pleno:
  todo sale del acento que el shell ya redefine por área (§5.1), así que el patrón no
  sabe de áreas. El texto va en navy (≥ 4,5:1 sobre las cinco tintas): por eso la
  cabecera es la tinta y no el color pleno, que no sostiene texto en naranja, Sea Green
  ni Sky Blue.
- **Saludo** con el primer nombre y la fecha de Bogotá; **una frase de plazo** sobre el
  alcance de la persona («en tu alcance hay 3 tickets vencidos…», resaltando solo los
  vencidos); **cifras** Abiertos, Asignados, Vencidos y Cerrados (las opciones del
  filtro de estado; sin Rechazados desde el corte 78), con el marcador del tono de su
  insignia (§5), que cuentan hasta su valor con el punto de los miles.
- **Semicírculo del área pegado al borde derecho**, tan alto como toda la cabecera y
  corrido a la derecha un octavo de su tamaño, con el globo blanco (272 px) centrado en
  la **franja visible** (hasta donde empieza el contenido). Entra una vez deslizándose
  desde la derecha, despacio. Se oculta por debajo de `lg`. Ni la forma ni el globo giran.
  *Corregido cinco veces el 04-nov-2026 tras verlo desplegado* (la quinta, medida solo
  sobre la franja visible con un tramo recto debajo, se veía recortada y el tramo, un
  poste suelto): un disco suelto que
  crecía en 600 ms (brusco, asomaba cortado por arriba, dejaba vacías las esquinas y su
  globo flotaba igual que el del estado vacío); un arco amplio con una curva corta
  abajo (no se leía como círculo); un círculo con solo la esquina inferior rellena (la
  superior quedaba vacía); un semicírculo medido sobre la cabecera entera (al montar el
  contenido creció, salía demasiado a la izquierda y el globo quedaba bajo la tarjeta).
  *Corregido el 05-nov-2026* (monitor ancho): la forma se ancla al borde de la columna
  de contenido y no al de la ventana; el tramo que sobra hasta el borde lleva el color
  del área, el globo se centra en todo el azul y unos hilos blancos en el ángulo de
  sus franjas (`.hd-mark-lines`) llenan el lado derecho, abiertos en un claro alrededor
  del globo. Elegida entre variantes en una maqueta (la «16»). Por debajo del ancho de
  la columna no cambia nada.
- **El contenido se monta 60 px sobre el borde de la cabecera** (decisión del usuario,
  04-nov-2026, entre teñir toda la vista y dejar el corte): la tinta sigue por detrás
  de la primera tarjeta y el paso al lienzo gris queda oculto bajo su borde. El
  solapamiento lo aplica el shell a todo el contenido, no a la bandeja: la primera
  versión lo aplicaba a la bandeja y tapaba lo que la vista pusiera antes de ella. La
  bandeja va en una tarjeta con sombra. Las filas entran escalonadas (solo las nuevas); el
  área va en un recuadro con su código de tres letras; el responsable, con sus
  iniciales; estado y plazo, con icono.
- **Estado vacío** (`patterns/empty-state/`): el mismo motivo a escala de tarjeta.

**Manual de marca, leído el 04-nov-2026** (el PDF está fuera del repositorio). Lo que
obliga aquí: el globo solo es motivo decorativo, **no se distorsiona ni se gira**
(§4.1); el logotipo completo no va dentro de una forma (§4.2), regla que no alcanza al
globo suelto; no se añaden palabras para leerse con el logotipo (§4.2), así que
«HelpDesk» nunca va junto a él. El manual ilustra el globo blanco sobre fotos
recortadas en círculo y sobre fondos sólidos, **no sobre un disco de color**: el disco es
una extrapolación. `ABIERTO`: confirmarlo con el área de mercadeo; si lo objeta, se
cambia `HeroGlobe` y nada más.

`DECISIÓN` (04-nov-2026, usuario) **Animación propia de la cabecera**, elegida entre
las variantes de la maqueta:

- **Trama que sigue al puntero** (`HeroPointerGrid`): una retícula de puntos del color
  del área aparece solo alrededor del puntero (90 px de alcance, compactada tras verla
  desplegada) y se apaga al salir. Es sobria a
  propósito, porque la cabecera se cruza a menudo para llegar a las pestañas. Solo con
  ratón o trackpad; con movimiento reducido, nada.
- **Sorpresa del globo** (`HeroGlobe`): cinco clics seguidos (sin más de 1,5 s entre
  ellos) y el globo salta dos veces y suelta doce chispas de los colores de la marca.
  Salta en vertical, sin girar ni deformarse. Decorativa: fuera del orden de
  tabulación y del lector de pantalla.

### 5.6 `DECISIÓN` (04-nov-2026, U31) Detalle del ticket

Maqueta aprobada por el usuario («U»). `app/tickets/[idTicket]/page.tsx`:

- **Cabecera en el color del área del ticket** (`patterns/area-hero/TicketHero.tsx`,
  con su propio `data-area`), no en el de quien lo mira: un ticket de Revisoría se ve
  naranja para todos. Código grande, área, estado y plazo; la primera línea de la
  descripción como título; cinco datos (solicitante, plazo, prioridad, tipo, radicado).
  El mismo semicírculo de la bandeja, con el globo quieto y más pequeño.
- **Historia que distingue por forma** (`TicketHistory`): los eventos en una línea con
  icono; la respuesta del equipo en burbuja navy, el comentario del solicitante en
  burbuja clara; la nota interna en ámbar, borde punteado, candado y «el solicitante no
  la ve». Sigue lo más reciente primero, bajo el cuadro de escritura.
- **El cuadro de escritura dice a quién llegará** lo escrito al pasar por cada botón
  (ratón o teclado), y se marca con su color: responder («lo verá el solicitante, el
  ticket se cierra»), comentar («lo verá el equipo»), nota («solo el equipo»). La nota
  tiene botón propio (variante `internal`): ámbar y punteado como en la historia.
- A la derecha, personas (responsable con sus iniciales, observadores, aprobación) y
  correos.

*Diferencia con la maqueta:* la maqueta ponía la historia en orden cronológico y el
cuadro al final; se conserva el orden vigente (cuadro arriba, lo más reciente primero),
porque en un ticket largo el cuadro quedaría a varias pantallas de distancia. Y en la
maqueta «Enviar comentario» parecía del equipo al solicitante; en el código es el
solicitante escribiéndole al equipo, y su aviso lo dice así.

### 5.7 `DECISIÓN` (04-nov-2026, U32) Barra mínima y escala contenida

Pedida por el usuario: al 100 % la pantalla se leía como al 125 %, y barra más fila de
secciones (128 px en escritorio) empujaban el contenido.

- **Sin fila de secciones.** Las secciones van en la barra y solo si hay más de una: la
  mayoría de las personas solo tiene Tickets.
- **Topbar de Conecta mínima (60 px, 56 en móvil):** hamburguesa, «HelpDesk», secciones,
  campana y avatar. Ya no lleva el título de la vista ni el rol con el nombre (el nombre
  está en el menú del avatar). El título encabeza el contenido o, con cabecera, queda
  para lector de pantalla. La barra directa conserva su alto, que fija el espacio libre
  del logotipo.
- **El interruptor Interno/Externo va junto a las vistas de la bandeja**
  (`features/shell/InboxModeSwitch.tsx`): solo cambia algo allí.
- **Escala:** `md` 15, `lg` 17, `xl` 20, `2xl` 26, `3xl` 30 px; `base` y `sm` no cambian.
  Lato Black sale de las vistas (queda Bold); sin versalitas en las cifras de la
  cabecera ni en los títulos de la tabla. El globo de la cabecera baja a 232 px.

Corte 66, en el detalle: la descripción tenía dos lugares (su primera línea como título
de la cabecera y entera en una tarjeta). Ahora solo va en la cabecera, recortada a tres
líneas con «Ver la descripción completa» si no cabe (`HeroDescription`). El globo del
detalle pasa al tamaño del de la bandeja: el más pequeño se leía como descuido, no como
señal de otra vista.

Corte 67: el semicírculo crece con la cabecera hasta 432 px (`size.heroMark`) y se
queda arriba a la derecha. Sin tope, la descripción expandida lo agrandaba hasta tapar
el texto; con él asoma como mucho 378 px, dentro de los 384 que el texto le deja.

Corte 68, decidido con el usuario: la descripción sale de la cabecera y va como **primer
mensaje del solicitante** (`TicketRequest`), encima del cuadro de escritura. Atender es
releer la petición mientras se escribe; el recorte con «ver completa» convertía la
cabecera en el cuerpo del ticket, y una ventana modal habría tapado el cuadro de
escritura. La cabecera vuelve a medir siempre lo mismo.

Corte 69: el aviso a todo lo ancho «Este ticket viene de PowerApps…» se sustituye por la
etiqueta «De PowerApps» junto al estado, en la cabecera (corte 71: sin «· solo
consulta», que ya se ve en que no hay cuadro de escritura ni acciones).

Corte 71: la tira de datos del detalle es una fila desde `lg` (antes desde `xl`: en
portátiles de 1280 px caía a dos filas sin divisores) y el anillo va centrado en
vertical. La etiqueta del área se mantiene: el color no identifica el área, porque
las áreas sin color propio comparten el de «general».

Corte 71, en la bandeja: la descripción de la columna «Ticket» se limita con un bloque
(`max-w-sm`) y no con la celda, cuyo ancho máximo la tabla ignoraba; por eso la tabla se
cortaba a la derecha. Solicitante, responsable y área en tipo oración.

Corte 72: en la tira del detalle el icono va encima de cada dato, no a su lado. El
anillo cuenta también la fracción del día hábil en curso o de cierre: un ticket radicado
un día y cerrado al siguiente marcaba 0 %.

Corte 70, maquetas «V-3», «X-B» y «W-9» del lienzo, elegidas por el usuario:
- **Anillo de plazo** (`patterns/area-hero/PlazoRing.tsx`) en lugar del semicírculo en la
  cabecera del detalle: el globo blanco en un disco del área, rodeado por un anillo que
  se llena con los días hábiles consumidos del plazo (`getPlazoProgress`, con
  `core.is_colombia_holiday`). Siempre del color del área: vencido, se cierra sin pasar
  a rojo. Al abrir se llena; luego su punta late (`.hd-ring-fill`, `.hd-ring-tip`).
- **Datos en una tira blanca** con icono por dato y divisores; el solicitante primero,
  con sus iniciales; la calificación en estrellas navy (`components/RatingStars.tsx`).
  Nombres en tipo oración (`personDisplayName`) y fechas cortas («12 ene 2024 · 12:08»).
- Se descartaron la constelación (compite con el anillo) y la línea de tiempo (repite
  lo que dice el anillo; las reasignaciones ya están en la Historia).

*No se hizo:* escalar toda la interfaz al 80 %. Llevaría el texto corrido de 14 a
11,2 px, y lo que al usuario se ve grande depende también del escalado de su pantalla.

### 5.8 `DECISIÓN` (04-nov-2026, U35) Correos con la marca de la plataforma

Pedida por el usuario: los correos «no tienen nada de HTML y se ven muy planos». Todos
—los cuatro del ticket, la respuesta al cliente, la invitación y el código del portal—
se dibujan con un solo layout, `server/notifications/mail-layout.ts`, adaptado de
`client-email-layout.ts` de Impulsa: tarjeta blanca sobre el lienzo, logotipo y
«HelpDesk» en la cabecera, título navy con la raya corta en Sky Blue, lo que escribió
una persona en una cita con filete Sky Blue, botón navy.

- **Tercer adaptador del contrato:** `themes/helpdesk-email.ts`. Colores, radios y
  ancho del logotipo salen de `helpdeskTheme`; los tamaños, de la escala convertida a
  píxeles. Fuera de `helpdeskTheme` porque un correo no lee variables CSS y no tiene
  gemelo en `:root`. Es autoridad en el barrido de `contract.test.mts`.
- **Tablas con estilos en línea**, botón VML para Outlook y Arial forzada en Outlook:
  lo que pinta el motor de Word.
- El logotipo se pide a `conecta.rbgct.cloud/helpdesk/rb-logo.png`, ya público por
  `public-assets.ts`. Si el cliente de correo bloquea imágenes externas, queda el texto
  alternativo.

### 5.9 `DECISIÓN` (06-nov-2026, U39) Gráficos

Un solo componente dibuja gráficos: `components/Chart.tsx`, con Apache ECharts 6.0.0
importado por módulos y dibujado en SVG, en el navegador. Concepto de Impulsa; paleta
propia.

- **Autoridades.**
  - Tamaños en px: `foundations/data-viz.ts`, porque ECharts necesita números.
  - Colores: `themes/helpdesk-chart.ts`, generados desde `brand.ts` y `helpdesk.ts`.
  - Alto del área de dibujo: `size.chart` y `size.chartTall`, como clases. No hay
    estilos en línea.
- **Papeles de color,** pasados por el validador de paletas:

  | Papel | Color | Uso |
  |---|---|---|
  | Área | El color pleno de cada área, el de la bandeja | Una barra que es un área lleva el suyo. Cualquier otra serie, el del área de la vista |
  | Escala | Rampa de navy a su tinta de 40 % | Una escala ordenada, de mejor a peor. Navy en todas las áreas |
  | Aparte | Sky Blue | Lo que no es un punto de la escala, siempre junto al navy |

  - **La escala no sigue al área.** Las rampas de naranja, Sea Green, Sky Blue y magenta
    separan sus pasos vecinos con ΔE 4 a 9, por debajo de 15: no se distinguen ni con
    visión normal (validador, 06-nov-2026).
  - **Sky Blue va siempre junto al navy.** Junto al navy separa con ΔE 38,6 bajo
    daltonismo; junto a la tinta de 40 %, solo con 1,6.
  - **El naranja, el Sea Green y el Sky Blue no llegan a 3:1 sobre blanco.** Por eso el
    nombre del área va en el eje.
  - **Los colores de estado no pintan series.**
- **Color de la vista.** Los indicadores llevan la cabecera del área (`AreaHero`, §5.4)
  con sus cinco cifras. Toman el color del área destino filtrada o, sin ese filtro, el
  de quien entra (`AppFrame`, `themeAreaName`).
- **Un solo eje.** Dos medidas de distinta escala son dos gráficos.
- **Cada gráfico lleva su tabla de datos** debajo, plegada en «Ver datos». Cubre el
  lector de pantalla y el contraste bajo de la tinta clara.

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
| V1b | `docs/design/marca/rb-logo.png` es el imagotipo oficial azul oscuro, recortado solo del margen transparente (2422×526, opaco en `#001871`); `public/rb-logo.png` es su derivado de 400 px | Dimensiones y color dominante del archivo | **Verificado** al recortarlo (System.Drawing: límites alfa y color opaco dominante). Derivados de U27, 03-nov-2026: Lanczos con `sharp`, revisados a ojo; anchos fijados por `brand-assets.test.mts` |
| V2 | Existe contrato ejecutable con capas separadas | `coraje-web/src/design-system/` | **Verificado:** `foundations/`, `themes/`, `recipes/`, `components/`, `patterns/`, `utilities/` |
| V3 | No hay valores quemados en vistas | Barrido de `contract.test.mts` sobre todo `src/` | **Verificado:** 10 detectores (hex, funciones de color, px, clases arbitrarias, z/duración numéricos, paleta por defecto, pesos, `font: inherit`, tamaño de icono, `style` en línea), cada uno con su prueba positiva y negativa; comprobado además forzando una violación en `page.tsx` |
| V4 | Los dos adaptadores del tema no divergen | `contract.test.mts` | **Verificado:** igualdad de claves y de valores; falla al forzar un valor distinto y una variable solo en CSS. Además, toda `var(--hd-…)` del código debe existir |
| V5 | El color de estado se resuelve desde una sola autoridad | Módulo de traducción estado→token | **Construido** (corte 18): `patterns/ticket-status/ticket-status.ts`, un `Record` exhaustivo por estado, plazo y correo. Solo pintan las insignias de `TicketStatusBadges.tsx` |
| V6 | Ningún control usa `font: inherit` | Detector del barrido | **Verificado** |
| V7 | La nota interna y la respuesta al cliente son inequívocas | Validación visual del detalle del ticket | **Construido, sin validar en navegador** (corte 18): rótulo en texto, icono distinto y forma distinta (fondo hundido con borde discontinuo) en `TicketHistory.tsx`. Además, quien solo radicó el ticket no recibe las notas internas |
| V8 | El portal es operable en móvil, teclado y lector de pantalla | Validación real, no inspección | Pendiente: no hay portal (U8) |
| V9 | La cabecera del área se lee en las cinco áreas y respeta el manual (§5.4) | Bandeja desplegada, suplantando una persona por área | **Construido, sin ver en navegador** (corte 54): tokens en los dos adaptadores, derivado `rb-isotype-white-hero.png` (640 px desde el corte 60) cubierto por `brand-assets.test.mts`; contraste del texto navy sobre las tintas ya medido por `area-palette.test.mts` |

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
- 01-oct-2026 — U16. §5.1: color por área (acento de quien entra, punto del área del
  ticket), con el token `info` fijo para los estados.
- 04-nov-2026 — U30. §2: se corrige la personalidad (sobria en lo que se trabaja, con
  voz en lo que recibe). §5.4: cabecera del área, estado vacío y reglas del manual de
  marca leídas sobre el PDF.

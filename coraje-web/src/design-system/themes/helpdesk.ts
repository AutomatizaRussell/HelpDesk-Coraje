import { brandOverNavy, brandPrimitives, tint } from "../foundations/brand";
import { typography } from "../foundations/typography";

// Marco navy del modo Externo (U17): la barra superior y la fila de pestañas
// comparten estos valores, así que se nombran una vez.
const externoBandLine = brandOverNavy(brandPrimitives.white, 0.14);
const externoBandMuted = brandOverNavy(brandPrimitives.white, 0.72);
const externoBandHover = brandOverNavy(brandPrimitives.white, 0.1);

/**
 * Tema de HelpDesk: la asignación concreta de cada decisión visual.
 *
 * **Adaptador TypeScript** de una decisión que tiene un segundo adaptador, el
 * bloque `:root` de `src/app/globals.css`, que es el que el navegador y
 * Tailwind consumen de verdad. Los dos se escriben por separado y por eso
 * pueden divergir en silencio —una pantalla «ligeramente distinta» que nadie
 * sabe explicar—; el validador `design-system/contract.test.mts` los aplana y
 * exige que coincidan clave a clave y valor a valor. Cambiar un valor aquí sin
 * cambiarlo allí (o al revés) rompe `pnpm test`.
 *
 * Convención de nombres: la ruta del objeto en kebab-case, con prefijo `--hd-`.
 * `color.surfaceSunken` → `--hd-color-surface-sunken`.
 */
export const helpdeskTheme = {
  color: {
    // Neutros fríos, afinados con el navy. No son colores de marca —el manual
    // no aprueba grises— y por eso se escriben aquí y no en `brand.ts`.
    canvas: "#f4f6f9",
    surface: brandPrimitives.white,
    surfaceSunken: "#f8f9fb",
    ink: "#1b2333",
    inkMuted: "#5b6577", // 5,4:1 sobre canvas: legible también en celdas secundarias
    heading: brandPrimitives.navy,
    line: "#dfe3ea",
    lineStrong: "#b3bccb",

    // Acento de HelpDesk (D5): **Sky Blue**, distinto del naranja de Impulsa.
    // Motivo de fondo: en una mesa de ayuda el registro cálido —ámbar, rojo—
    // es la señal de SLA y urgencia, y tiene que quedar libre. Un acento frío
    // no compite con ella. Sky Blue sobre blanco da 2,8:1: **nunca texto ni
    // indicador único de estado**, solo marca (pestaña activa, barra de
    // selección) y su tinta al 20 % como fondo de selección.
    accent: brandPrimitives.skyBlue,
    accentSurface: tint("skyBlue", 20),
    // Tinta sobre un relleno del acento (la inicial del avatar, el número de
    // la campana). Navy sobre Sky Blue da 5,9:1; el blanco no llegaría. Cada
    // área la redefine junto con el acento (`area`, abajo).
    onAccent: brandPrimitives.navy,

    // Información de estado («Asignado», «Requiere tu atención»). Es Sky Blue
    // como el acento por defecto, pero **no** sigue al área (U16): un estado
    // tiene que verse igual para todas las personas.
    info: brandPrimitives.skyBlue,
    infoSurface: tint("skyBlue", 20),

    // Fondo del círculo con las iniciales de una persona (U30): navy al
    // 20 %, con las iniciales en navy. No sigue al área: es una persona, no
    // un área, y debe verse igual para todos.
    avatarSurface: tint("navy", 20),

    // Hilos que llenan la forma de la cabecera en pantalla ancha
    // (`.hd-mark-lines`): blancos, como el globo que comparte la forma.
    markLine: brandPrimitives.white,

    // El foco es navy y no el acento: un anillo de foco necesita 3:1 contra
    // lo que lo rodea (WCAG 1.4.11) y Sky Blue no lo alcanza sobre blanco.
    focus: brandPrimitives.navy,
    // Foco sobre superficie oscura (el sidebar navy): el navy sería invisible.
    focusInverse: brandPrimitives.white,
    action: brandPrimitives.navy,
    actionHover: tint("navy", 80),
    onAction: brandPrimitives.white,

    // Estados de retroalimentación: no son colores de marca, igual que el rojo
    // de peligro no lo es en ninguna marca. Todos con ≥ 4,5:1 sobre su fondo.
    danger: "#b42318",
    dangerSurface: "#fef3f2",
    warning: "#b54708",
    warningSurface: "#fffaeb",
    success: "#067647",
    successSurface: "#ecfdf3",
  },
  radius: {
    // Más contenidos que los de Impulsa (8/12/16): la bandeja es densa y un
    // radio grande en filas apretadas se lee como tarjeta, no como tabla.
    control: "6px",
    surface: "10px",
    pill: "999px",
    // Cajas de cifra de la cabecera del área (U30): más redondas que una
    // superficie de trabajo porque flotan sobre el color, no ordenan datos.
    card: "12px",
    shellItem: "8px", // réplica de Conecta (`rounded-lg` de sus ítems)
    shellItemActive: "10px", // réplica de Conecta (`.rb-sidebar-item-active`)
    scrollbar: "3px", // réplica de Conecta (::-webkit-scrollbar-thumb)
  },
  shadow: {
    overlay: "0 16px 48px rgba(0, 24, 113, 0.18)",
    // Superficie elevada sobre el lienzo (la bandeja bajo la cabecera, U30):
    // un borde de contacto y una sombra larga y tenue, teñida de navy. Es lo
    // que separa la tarjeta del lienzo sin depender solo del borde de 1 px.
    raised: "0 1px 2px rgba(0, 24, 113, 0.06), 0 12px 32px rgba(0, 24, 113, 0.12)",
  },
  motion: {
    fast: "120ms",
    normal: "180ms",
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    // Recorrido de entrada del toast: lo justo para que se note que llega.
    toastOffset: "8px",
    // Cabecera del área (U30). `enter`: las filas de la bandeja al aparecer.
    // `heroEnter`/`heroOffset`: la forma del área entra una vez deslizándose
    // desde el borde derecho, despacio (la primera versión crecía en 600 ms y
    // se leía brusca, corregido el 04-nov-2026 tras verla desplegada).
    // `float`/`floatOffset`: el globo sube y baja muy despacio, siempre, para
    // no distraer en una pantalla que se mira muchas veces al día. `count`: lo
    // que tardan las cifras en llegar a su valor. `stagger`/`riseOffset`: las
    // filas entran una tras otra, con este retraso y este recorrido.
    enter: "600ms",
    heroEnter: "1200ms",
    heroOffset: "48px",
    float: "8s",
    floatOffset: "6px",
    count: "1100ms",
    stagger: "40ms",
    riseOffset: "8px",
    // La sorpresa del globo de la cabecera (U30): tras cinco clics seguidos,
    // salta dos veces —`hopHeight` el primer salto— y suelta chispas de los
    // colores de la marca durante `celebrate`.
    celebrate: "1100ms",
    hopHeight: "34px",
    // Anillo de plazo del detalle (U32): se llena en `ringFill` al abrir y,
    // lleno, la punta late con un ciclo de `ringBreathe`.
    ringFill: "1600ms",
    ringBreathe: "2400ms",
  },
  size: {
    // Topbar de la entrada desde Conecta. Nació como réplica de la de Conecta
    // (h-16, lg:h-[84px]); desde U32 solo lleva el nombre del módulo, sus
    // secciones, la campana y el avatar, y adelgaza: el título de cada vista
    // va en su contenido o en su cabecera. Sin logotipo: la marca va en la
    // columna (design/sistema-helpdesk.md §2).
    topbar: "56px",
    topbarWide: "60px",
    // Barra propia de HelpDesk en entrada directa, sin shell de Conecta, con
    // el logotipo. El manual exige un ancho mínimo de 30 mm (≈ 113 px) y un
    // espacio libre de al menos el 20 % de su ancho. Con la proporción del
    // imagotipo oficial (2422 × 526 ≈ 4,6 : 1):
    //   · ancha 84 px, logo 132 px → alto 28,7, libre 26,4, holgura vertical 27,6 ✓
    //   · compacta 72 px, logo 116 px → alto 25,2, libre 23,2, holgura vertical 23,4 ✓
    appBar: "72px",
    appBarWide: "84px",
    logoAppBar: "132px",
    logoAppBarCompact: "116px",
    // Isotipo de la columna replegada, como en Conecta (md:h-9).
    isotype: "36px",
    // Sidebar desplegado: los tres anchos de Conecta (w-56 md:w-64 2xl:w-72;
    // hasta su rediseño del 04-nov-2026 llegaba a w-80). El logotipo crece con
    // él y siempre cabe con su espacio libre (20 % por lado) más el botón de
    // cerrar: 130·1,4+36 ≤ 224, 150·1,4+36 ≤ 256, 170·1,4+36 ≤ 288. Conecta
    // pone 170 ya en 224 px, sin espacio libre; aquí manda el manual.
    sidebar: "224px",
    sidebarMd: "256px",
    sidebarWide: "288px",
    logoSidebar: "130px",
    logoSidebarMd: "150px",
    logoSidebarWide: "170px",
    // Pie del sidebar (rediseño de Conecta del 04-nov-2026): el globo como
    // marca de agua, saliéndose por la esquina (h-48), y la franja corta
    // sobre el lema (h-[3px]). Conecta encoge el globo y oculta el lema con
    // `max-height: 720px`; aquí no, porque una consulta de medios no puede
    // consumir un token. El menú del diálogo se desplaza, así que en una
    // pantalla baja nada queda fuera de alcance.
    shellWatermark: "192px",
    shellAccentBar: "3px",
    logoAccess: "200px",
    stripe: "4px",
    scrollbar: "6px", // réplica de Conecta (::-webkit-scrollbar)
    rail: "80px",
    accessPanel: "400px",
    contentMax: "1440px",
    // Columna de un formulario de tarea (crear un ticket): centrada en el
    // lienzo, con un largo de línea legible para etiquetas, ayudas y texto.
    formMax: "768px",
    // Panel de la campana (U15): la anchura de una columna de lectura corta,
    // con título y una línea de detalle por aviso. En pantallas más estrechas
    // lo limita el propio viewport, con su margen.
    noticePanel: "384px",
    // Toast (U29): un mensaje de una o dos líneas que aparece en una esquina y
    // se va solo. En móvil lo limita el viewport, con su margen.
    toast: "384px",
    // Alto del visor de adjuntos (U29): casi toda la ventana, con margen para
    // el título de la ventana y el botón de descargar.
    preview: "75vh",
    // Cabecera del área (U30): la forma del color del área es un semicírculo
    // tan alto como la parte visible de la cabecera, pegado al borde derecho,
    // con el globo blanco en su centro. `heroGlobe` fija el ancho del globo y,
    // con él, el del derivado `public/rb-isotype-white-hero.png` (640 px, entre
    // el doble y el triple); lo comprueba `brand-assets.test.mts`.
    // `heroStripe`: la franja superior del color pleno.
    heroGlobe: "232px",
    // Tope del semicírculo (U32): crece con la cabecera hasta aquí y no más.
    // Sin tope, una cabecera alta (la descripción de un ticket expandida) lo
    // agrandaba hasta tapar el texto. Asoma 7/8 de su ancho (el resto queda
    // fuera por `translate-x-1/8`): 432 × 7/8 = 378 px, dentro de los 384
    // que el texto le deja libres (`lg:mr-96`) en las dos cabeceras.
    heroMark: "432px",
    // Anillo de plazo de la cabecera del detalle (U32) y el globo de su disco.
    plazoRing: "176px",
    ringGlobe: "96px",
    // Alto del área de dibujo de un gráfico (U39, indicadores). El ancho es
    // el del contenedor; el alto es fijo para que la página no salte mientras
    // los gráficos montan. `chartTall`: barras horizontales con hasta doce
    // personas o áreas, cada una con su etiqueta legible.
    chart: "288px",
    chartTall: "416px",
    heroStripe: "6px",
    // Trama que sigue al puntero sobre la cabecera (U30), en la bandeja y en
    // el detalle del ticket, del color del área y visible solo en un círculo
    // alrededor del puntero. Compactada el 04-nov-2026 tras verla desplegada
    // (antes 150 px de alcance: se leía como una mancha grande).
    // 05-nov-2026: los puntos pasan a rayas de `pointerLine` cada
    // `pointerLineGap`, en el ángulo de las franjas del globo (las de la forma
    // en pantalla ancha, más pequeñas), y el círculo baja a `pointerReach`
    // (64 px en el corte 75; la mitad en el 76, a pedido del usuario).
    pointerLine: "1.5px",
    pointerLineGap: "7px",
    pointerReach: "32px",
    // Hilos de la forma en pantalla ancha (05-nov-2026, variante «16» de la
    // maqueta): líneas de `heroMarkLine` cada `heroMarkLineGap` en el ángulo
    // de las franjas del globo. Finas a propósito: llevan el ritmo del globo
    // sin competir con el grosor de sus franjas.
    heroMarkLine: "2px",
    heroMarkLineGap: "14px",
    // Chispas de la sorpresa del globo: su tamaño y hasta dónde llegan.
    spark: "10px",
    sparkReach: "160px",
    // Alto de la barra de progreso de un adjunto que se sube (U31).
    progress: "4px",
    // Estado vacío (U30): el mismo motivo a escala de tarjeta. Disco exterior
    // en la tinta del área, disco interior en el color pleno, globo blanco.
    emptyMark: "88px",
    emptyMarkInner: "56px",
    emptyIsotype: "32px",
  },
  layer: {
    rail: "20",
    topbar: "30",
    // Por encima del shell: el toast confirma algo que acaba de pasar y no
    // puede quedar detrás de la barra.
    toast: "40",
  },

  /**
   * Réplica del shell de Conecta (sidebar y topbar), y **nada más** de Conecta
   * (design/sistema-helpdesk.md §2). Son los valores del commit de RBGCT-REACT
   * que fija `patterns/conecta-shell/conecta-upstream.json`:
   * `components/layout/{SidebarShell,RoleSidebar,Topbar}.jsx` y las reglas
   * `.rb-sidebar-*` de `index.css`, pasados de clases de Tailwind a valor.
   * Viven agrupados para que se sepa que son copia: si Conecta cambia, este es
   * el único bloque que se actualiza, y ningún otro componente debe tomarlos.
   *
   * Una sola desviación de valor, por accesibilidad: la etiqueta de sección
   * usa blanco al 60 % y no al 45 % —sobre navy, el 45 % da 4,2:1, por debajo
   * de AA para texto pequeño—.
   */
  shell: {
    // Sidebar: navy plano, textos en blanco con opacidades.
    surface: brandPrimitives.navy,
    line: "#001560",
    divider: "rgba(255, 255, 255, 0.1)",
    itemInk: "rgba(255, 255, 255, 0.72)",
    itemHoverSurface: "rgba(255, 255, 255, 0.08)",
    // Ítem activo: pastilla blanca con texto navy (rediseño del 04-nov-2026).
    itemActiveSurface: brandPrimitives.white,
    itemActiveInk: brandPrimitives.navy,
    itemActiveShadow: "0 1px 2px rgba(0, 10, 50, 0.25)",
    onSurface: brandPrimitives.white,
    onSurfaceMuted: "rgba(255, 255, 255, 0.6)",
    // Línea que cuelga los hijos de un grupo («Mis clientes»).
    groupLine: "rgba(255, 255, 255, 0.15)",
    // Pie: franja Sea Green (el `rb-turquesa` de Conecta), lema y marca de agua.
    accentBar: brandPrimitives.seaGreen,
    sloganInk: "rgba(255, 255, 255, 0.8)",
    watermarkOpacity: "0.12",
    signOutInk: "rgba(255, 255, 255, 0.7)",
    signOutHoverSurface: "rgba(239, 68, 68, 0.15)",
    signOutHoverInk: "#fecaca",
    scrim: "rgba(0, 0, 0, 0.5)",

    // Topbar: blanca, sin franja.
    topbarSurface: brandPrimitives.white,
    topbarLine: "#e2e8f0",
    topbarMuted: "#64748b",
    controlHoverSurface: "#f1f5f9",
    // Texto principal y foco de la topbar. Son el navy de siempre; existen
    // aparte porque el modo Externo pinta la topbar en navy (U17) sin tocar
    // el texto ni el foco del contenido.
    topbarInk: brandPrimitives.navy,
    topbarFocus: brandPrimitives.navy,

    // Menú del avatar.
    menuLine: "#e2e8f0",
    menuHeaderSurface: "#f8fafc",
    menuShadow: "0 16px 48px -16px rgba(15, 23, 42, 0.22)",
    menuDangerInk: "#ef4444",
    menuDangerHoverInk: "#dc2626",
    menuDangerHoverSurface: "#fef2f2",

    // Barra de desplazamiento de Conecta, global en su index.css: fina, carril
    // transparente, pulgar gris que se oscurece al pasar el ratón.
    scrollbarThumb: "#cbd5e1",
    scrollbarThumbHover: "#94a3b8",
  },

  /**
   * Color de cada área de la firma (U16, decisión del usuario del 01-oct-2026).
   * El manual de marca (§3.2) reserva los colores complementarios «para
   * representar las diferentes áreas que conforman a la firma»; la asignación
   * la dio el usuario:
   *   · revisoria (Auditoría y Revisoría Fiscal) → Earth Orange;
   *   · contabilidad → Mind Magenta;
   *   · bpo → Sea Green;
   *   · legal → Space Blue (navy);
   *   · general (Administración, su recepción, Impuestos y sin área) → Sky Blue.
   *
   * Dos usos (`patterns/area/area.ts`): el acento de la aplicación sigue el
   * área **de quien entra** (`[data-area]` redefine `--hd-color-accent*` en
   * `globals.css`), y el punto de la columna «Área» sigue el área **del
   * ticket**. Los estados no cambian: usan `info`, fijo.
   *
   * `mark` es el color pleno: punto, avatar, número de la campana; nunca
   * texto, porque naranja, Sea Green y Sky Blue no llegan a 4,5:1 sobre
   * blanco. `onMark` es la tinta legible sobre `mark`. `surface` es su tinta
   * al 20 %, fondo de la pestaña o la selección activas, con texto navy.
   * `design-system/area-palette.test.mts` mide los contrastes.
   */
  area: {
    revisoria: { mark: brandPrimitives.earthOrange, surface: tint("earthOrange", 20), onMark: brandPrimitives.navy },
    contabilidad: { mark: brandPrimitives.mindMagenta, surface: tint("mindMagenta", 20), onMark: brandPrimitives.white },
    bpo: { mark: brandPrimitives.seaGreen, surface: tint("seaGreen", 20), onMark: brandPrimitives.navy },
    legal: { mark: brandPrimitives.navy, surface: tint("navy", 20), onMark: brandPrimitives.white },
    general: { mark: brandPrimitives.skyBlue, surface: tint("skyBlue", 20), onMark: brandPrimitives.navy },
  },

  /**
   * Modo Externo (U17, decisión del usuario del 01-oct-2026): el trabajo con
   * clientes en la misma aplicación, como un modo claro u oscuro. Cambia el
   * **marco**, no el contenido: la barra superior y la fila de pestañas pasan
   * a navy, continuando la columna de Conecta, y el lienzo se tiñe apenas de
   * azul. Tarjetas, texto, botones y estados no cambian («que en esencia
   * cambie poco», corregido el mismo día tras verlo: el lienzo navy entero
   * pesaba y no se distinguía de las tarjetas).
   *
   * Cuatro grupos, cada uno con su selector en `globals.css`:
   *
   * - `color` y `shell`, en `[data-mode="externo"]`: cada clave redefine la
   *   variable del mismo nombre del tema base (`externo.color.canvas` es el
   *   `color.canvas` del modo).
   * - `band`, en `[data-mode="externo"] [data-shell-band]`: la fila de
   *   pestañas, que reutiliza los componentes de siempre (`bg-surface`,
   *   `text-heading`…), los recibe redefinidos solo dentro de ella. La topbar
   *   no puede hacer lo mismo porque sus menús cuelgan de ella y quedarían
   *   navy; usa sus propias variables (`shell.topbar*`).
   * - `accent`, en `[data-mode="externo"][data-area="…"]`: Legal y
   *   Contabilidad no se ven sobre navy (1:1 y 2,2:1) y toman su tinta
   *   aprobada más clara, con tinta navy encima.
   *
   * `design-system/externo-palette.test.mts` exige que cada clave exista en el
   * tema base, que los bloques CSS las redefinan todas y solo esas, y mide los
   * contrastes.
   */
  externo: {
    color: {
      // Neutro, como el lienzo de siempre: un punto más azul.
      canvas: "#edf0f8",
    },
    shell: {
      topbarSurface: brandPrimitives.navy,
      topbarLine: externoBandLine,
      topbarInk: brandPrimitives.white,
      topbarMuted: externoBandMuted,
      topbarFocus: brandPrimitives.white,
      controlHoverSurface: externoBandHover,
    },
    band: {
      surface: brandPrimitives.navy,
      surfaceSunken: externoBandHover,
      line: externoBandLine,
      heading: brandPrimitives.white,
      inkMuted: externoBandMuted,
      // La opción activa del interruptor: el tinte del área sería claro
      // debajo de texto blanco.
      accentSurface: brandOverNavy(brandPrimitives.white, 0.18),
      focus: brandPrimitives.white,
    },
    accent: {
      legal: { accent: tint("navy", 40), onAccent: brandPrimitives.navy },
      contabilidad: { accent: tint("mindMagenta", 60), onAccent: brandPrimitives.navy },
    },
  },

  /**
   * Franja corporativa de cuatro colores, en el orden del manual de marca
   * (portada, membrete, presentaciones): navy · magenta · teal · naranja. Es
   * motivo de marca, no del shell: hoy solo la usa la pantalla de acceso.
   */
  stripe: [
    brandPrimitives.navy,
    brandPrimitives.mindMagenta,
    brandPrimitives.seaGreen,
    brandPrimitives.earthOrange,
  ],

  weight: typography.weight,
  type: typography.scale,
} as const;

export type HelpdeskTheme = typeof helpdeskTheme;

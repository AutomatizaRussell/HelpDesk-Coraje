import { brandPrimitives, tint } from "../foundations/brand";
import { typography } from "../foundations/typography";

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
    shellItem: "8px", // réplica de Conecta (`rounded-lg` de sus ítems)
    scrollbar: "3px", // réplica de Conecta (::-webkit-scrollbar-thumb)
  },
  shadow: {
    overlay: "0 16px 48px rgba(0, 24, 113, 0.18)",
  },
  motion: {
    fast: "120ms",
    normal: "180ms",
    easing: "cubic-bezier(0.2, 0, 0, 1)",
  },
  size: {
    // Topbar replicada de Conecta (h-16, lg:h-[84px]). No lleva logotipo: la
    // marca va en el sidebar, como en Conecta (design/sistema-helpdesk.md §2).
    topbar: "64px",
    topbarWide: "84px",
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
    // Sidebar desplegado: los cuatro anchos de Conecta (w-56 md:w-64 lg:w-72
    // xl:w-80). El logotipo crece con él y siempre cabe con su espacio libre
    // (20 % por lado) más el botón de cerrar: 130·1,4+36 ≤ 224, 150·1,4+36 ≤ 256,
    // 170·1,4+36 ≤ 288, 190·1,4+36 ≤ 320. Conecta pone 170 ya en 224 px, sin
    // espacio libre; aquí manda el manual.
    sidebar: "224px",
    sidebarMd: "256px",
    sidebarLg: "288px",
    sidebarXl: "320px",
    logoSidebar: "130px",
    logoSidebarMd: "150px",
    logoSidebarLg: "170px",
    logoSidebarXl: "190px",
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
  },
  layer: {
    rail: "20",
    topbar: "30",
  },

  /**
   * Réplica del shell de Conecta (sidebar y topbar), y **nada más** de Conecta
   * (design/sistema-helpdesk.md §2). Son los valores de RBGCT-REACT `cb06681`
   * (`main` = `stiben` = `lulox`, verificado el 24-sep-2026 contra lo desplegado):
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
    itemActiveSurface: "rgba(255, 255, 255, 0.14)",
    onSurface: brandPrimitives.white,
    onSurfaceMuted: "rgba(255, 255, 255, 0.6)",
    badgeSurface: "rgba(255, 255, 255, 0.12)",
    badgeInk: "rgba(255, 255, 255, 0.9)",
    cardLine: "rgba(255, 255, 255, 0.15)",
    cardSurface: "rgba(255, 255, 255, 0.05)",
    avatarFrom: "rgba(255, 255, 255, 0.25)",
    avatarTo: "rgba(255, 255, 255, 0.1)",
    signOutInk: "rgba(255, 255, 255, 0.7)",
    signOutHoverSurface: "rgba(239, 68, 68, 0.15)",
    signOutHoverInk: "#fecaca",
    scrim: "rgba(0, 0, 0, 0.5)",

    // Topbar: blanca, sin franja.
    topbarSurface: brandPrimitives.white,
    topbarLine: "#e2e8f0",
    topbarMuted: "#64748b",
    controlHoverSurface: "#f1f5f9",

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

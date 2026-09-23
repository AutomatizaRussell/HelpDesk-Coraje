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

    // El foco es navy y no el acento: un anillo de foco necesita 3:1 contra
    // lo que lo rodea (WCAG 1.4.11) y Sky Blue no lo alcanza sobre blanco.
    focus: brandPrimitives.navy,
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
    // El manual exige al logotipo un ancho mínimo de 30 mm (≈ 113 px) y un
    // espacio libre alrededor de al menos el 20 % de su ancho. Con la
    // proporción del imagotipo oficial (2422 × 526 ≈ 4,6 : 1):
    //   · topbar ancha  84 px, logo 132 px → alto 28,7, libre 26,4, holgura vertical 27,6 ✓
    //   · topbar compacta 72 px, logo 116 px → alto 25,2, libre 23,2, holgura vertical 23,4 ✓
    // Por eso la topbar compacta mide 72 y no los 64 de Conecta: a 64 el logo
    // no cabe con su espacio libre en ningún tamaño legal.
    topbar: "72px",
    topbarWide: "84px",
    logoTopbar: "132px",
    logoTopbarCompact: "116px",
    logoSidebar: "200px", // 240 en Conecta, pero 240 + 2 × 48 de espacio libre no cabe en 320
    logoAccess: "200px",
    stripe: "4px",
    rail: "72px",
    sidebar: "320px",
    accessPanel: "400px",
    contentMax: "1440px",
  },
  layer: {
    rail: "20",
    topbar: "30",
  },

  /**
   * Réplica del shell de Conecta (sidebar y topbar), y **nada más** de Conecta
   * (design/sistema-helpdesk.md §2). Son los valores de
   * `RBGCT-REACT/frontend/src/components/layout/{SidebarShell,UserSidebar,Topbar}.jsx`
   * e `index.css` en `main` @ `e27662b`, pasados de clases de Tailwind a valor.
   * Viven agrupados para que se sepa que son copia: si Conecta cambia, este es
   * el único bloque que se actualiza, y ningún otro componente debe tomarlos.
   */
  shell: {
    surface: brandPrimitives.white,
    line: "#e2e8f0",
    itemInk: "#1e293b",
    itemHoverSurface: "rgba(0, 169, 206, 0.08)",
    itemHoverInk: brandPrimitives.navy,
    itemActiveFrom: brandPrimitives.navy,
    itemActiveTo: "#0a2b5f",
    itemActiveShadow: "0 8px 18px -12px rgba(0, 24, 113, 0.45)",
    onItemActive: brandPrimitives.white,
    muted: "#64748b",
    controlHoverSurface: "#f1f5f9",
    badgeLine: "#dce3e8",
    badgeSurface: "#f8fafc",
    cardSurface: "#f8fafc",
    signOutHoverSurface: "#fef2f2",
    signOutHoverInk: "#dc2626",
    avatarFrom: brandPrimitives.navy,
    avatarTo: brandPrimitives.skyBlue,
    scrim: "rgba(0, 0, 0, 0.5)",
  },

  /**
   * Franja corporativa de cuatro colores, en el orden del manual de marca
   * (portada, membrete, presentaciones): navy · magenta · teal · naranja. Es
   * motivo de marca, no del shell: la usan la topbar y la pantalla de acceso.
   * Conecta la pinta en otro orden; aquí manda el manual.
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

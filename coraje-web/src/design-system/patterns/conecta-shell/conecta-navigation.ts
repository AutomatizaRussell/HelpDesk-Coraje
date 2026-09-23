import {
  BookOpen,
  Building2,
  CircleUser,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Menú del portal de empleados de Conecta, replicado dentro de HelpDesk.
 *
 * Copia de `RBGCT-REACT/frontend/src/components/layout/UserSidebar.jsx` en
 * `main` @ `e27662b`: mismas secciones, mismas etiquetas, mismos iconos y
 * mismas rutas. Si Conecta cambia su menú, este archivo es lo único que se
 * actualiza.
 *
 * Diferencias deliberadas con el original:
 *
 * - **Cursos** no aparece. En Conecta solo se muestra si hay cursos activos, y
 *   averiguarlo exige su API, a la que HelpDesk no tiene acceso ni debe tenerlo.
 *   Mostrarlo siempre llevaría a veces a una pantalla vacía.
 * - **HelpDesk** figura en «Recursos», marcado como activo. Conecta todavía no
 *   tiene esa entrada: añadirla en su repositorio es el único cambio que D7
 *   exige del lado de Conecta (`contexto-canonico.md` §1.1).
 *
 * Cada `href` es una ruta del dominio de Conecta, fuera del `basePath` de
 * HelpDesk. Por eso el shell los pinta con `<a>` y nunca con `<Link>`, que les
 * antepondría `/helpdesk`: la navegación a Conecta es una carga completa.
 */
export type ConectaNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  current?: boolean;
};

export type ConectaNavSection = { label: string; items: ConectaNavItem[] };

export const CONECTA_BADGE = "Portal Empleado";

export const CONECTA_NAVIGATION: ConectaNavSection[] = [
  {
    label: "Mi espacio",
    items: [
      { label: "Mi resumen", href: "/app", icon: LayoutDashboard },
      { label: "Auto gestión", href: "/app/auto-gestion", icon: ClipboardList },
      { label: "Mis clientes", href: "/app/mis-clientes", icon: Building2 },
      { label: "Mi perfil", href: "/app/perfil", icon: CircleUser },
    ],
  },
  {
    label: "Recursos",
    items: [
      { label: "Reglamento", href: "/app/comunicados", icon: BookOpen },
      { label: "Herramientas", href: "/app/utilidades", icon: Wrench },
      { label: "HelpDesk", href: "/helpdesk", icon: LifeBuoy, current: true },
    ],
  },
];

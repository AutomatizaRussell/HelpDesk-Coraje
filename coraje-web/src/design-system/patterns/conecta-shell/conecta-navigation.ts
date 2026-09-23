import {
  BookOpen,
  CircleUser,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Menú del portal de empleados de Conecta, replicado dentro de HelpDesk.
 *
 * Copia de `SIDEBAR_CONFIG.empleado` en
 * `RBGCT-REACT/frontend/src/components/layout/sidebarConfig.js`, rama
 * `stiben` @ `9df5500` (la que coincide con lo desplegado): mismas secciones,
 * etiquetas, iconos y rutas. Si Conecta cambia su menú, este archivo es lo
 * único que se actualiza.
 *
 * Diferencias deliberadas con el original, todas por la misma razón —Conecta
 * decide su visibilidad con datos que HelpDesk no tiene ni debe pedir—:
 *
 * - **Mis clientes** (grupo con «Formularios SQF») no aparece: Conecta lo
 *   muestra solo si el empleado tiene alguno de los permisos `acceso_sqf_*`.
 * - **Formación** no aparece: Conecta la muestra solo si su API devuelve
 *   cursos activos. Mostrarla siempre llevaría a veces a una pantalla vacía.
 * - **HelpDesk** figura en «Recursos», marcado como activo. Conecta todavía no
 *   tiene esa entrada: añadirla en su repositorio es el único cambio que D7
 *   exige del lado de Conecta (`contexto-canonico.md` §1.1).
 *
 * Las rutas internas son del dominio de Conecta, fuera del `basePath` de
 * HelpDesk: el shell las pinta con `<a>` y nunca con `<Link>`, que les
 * antepondría `/helpdesk`. Los accesos rápidos (`external`) abren pestaña
 * nueva, igual que en Conecta.
 */
export type ConectaNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  current?: boolean;
  external?: boolean;
};

export type ConectaNavSection = { label: string; items: ConectaNavItem[] };

export const CONECTA_BADGE = "Portal Empleado";

/** Etiqueta del rol que la topbar de Conecta muestra encima del nombre. */
export const CONECTA_ROLE_LABEL = "Colaborador";

export const CONECTA_NAVIGATION: ConectaNavSection[] = [
  {
    label: "Mi espacio",
    items: [
      { label: "Mi resumen", href: "/app", icon: LayoutDashboard },
      { label: "Auto gestión", href: "/app/auto-gestion", icon: ClipboardList },
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
  {
    label: "Accesos rápidos",
    items: [
      { label: "SQF", href: "https://app.sqfmanager.com/sign-in", icon: ExternalLink, external: true },
    ],
  },
];

import {
  BookOpen,
  Building2,
  CircleUser,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  LayoutDashboard,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Menú del portal de empleados de Conecta, replicado dentro de HelpDesk.
 *
 * Copia de `SIDEBAR_CONFIG.empleado` en
 * `RBGCT-REACT/frontend/src/components/layout/sidebarConfig.js`, verificada
 * contra `cb06681` (24-sep-2026, `main` = `stiben` = `lulox`): mismas
 * secciones, etiquetas, iconos, rutas y condiciones de visibilidad. Si Conecta
 * cambia su menú, este archivo es lo único que se actualiza.
 *
 * Condiciones de visibilidad, tal como las aplica Conecta:
 *
 * - **Mis clientes** (grupo con «Formularios SQF»): solo con algún permiso
 *   `acceso_sqf_*`. HelpDesk lo sabe por el perfil de Conecta
 *   (server/auth/entry-context.ts), y solo lo muestra; Conecta protege la ruta.
 * - **Formación**: solo si el empleado tiene cursos vigentes. Ese cálculo vive
 *   en el backend de Conecta y no está en el navegador, así que hoy no aparece
 *   (specs/integracion-conecta.md §5, pendiente).
 *
 * Ítem activo: **Auto gestión**. El acceso a HelpDesk desde Conecta irá en esa
 * vista, no en el menú (decisión del usuario, 24-sep-2026; se construye cuando
 * HelpDesk esté listo), así que el menú no gana ninguna entrada «HelpDesk».
 *
 * Las rutas son del dominio de Conecta, fuera del `basePath` de HelpDesk: el
 * shell las pinta con `<a>` y nunca con `<Link>`, que les antepondría
 * `/helpdesk`. Los accesos rápidos (`external`) abren pestaña nueva, como en
 * Conecta.
 */
export type ConectaNavLink = {
  kind: "link";
  label: string;
  href: string;
  icon: LucideIcon;
  current?: boolean;
  external?: boolean;
};

/** Grupo estático: no navega, solo agrupa sus hijos (como en Conecta). */
export type ConectaNavGroup = {
  kind: "group";
  label: string;
  icon: LucideIcon;
  children: ConectaNavLink[];
};

export type ConectaNavEntry = ConectaNavLink | ConectaNavGroup;
export type ConectaNavSection = { label: string; items: ConectaNavEntry[] };

/** Lo que decide qué entradas ve cada persona. */
export type ConectaNavVisibility = { sqfAccess: boolean };

export const CONECTA_BADGE = "Portal Empleado";

/** Etiqueta del rol que la topbar de Conecta muestra encima del nombre. */
export const CONECTA_ROLE_LABEL = "Colaborador";

/** Subtítulo de la tarjeta cuando no hay área ni cargo (misma regla que Conecta). */
export const CONECTA_SUBTITLE_FALLBACK = "Colaborador";

export function conectaNavigation({ sqfAccess }: ConectaNavVisibility): ConectaNavSection[] {
  const miEspacio: ConectaNavEntry[] = [
    { kind: "link", label: "Mi resumen", href: "/app", icon: LayoutDashboard },
    { kind: "link", label: "Auto gestión", href: "/app/auto-gestion", icon: ClipboardList },
  ];
  if (sqfAccess) {
    miEspacio.push({
      kind: "group",
      label: "Mis clientes",
      icon: Building2,
      children: [{ kind: "link", label: "Formularios SQF", href: "/app/sqf", icon: FileSpreadsheet }],
    });
  }
  miEspacio.push({ kind: "link", label: "Mi perfil", href: "/app/perfil", icon: CircleUser });

  return [
    { label: "Mi espacio", items: miEspacio },
    {
      label: "Recursos",
      items: [
        { kind: "link", label: "Reglamento", href: "/app/comunicados", icon: BookOpen },
        { kind: "link", label: "Herramientas", href: "/app/utilidades", icon: Wrench },
      ],
    },
    {
      label: "Accesos rápidos",
      items: [
        {
          kind: "link",
          label: "SQF",
          href: "https://app.sqfmanager.com/sign-in",
          icon: ExternalLink,
          external: true,
        },
      ],
    },
  ];
}

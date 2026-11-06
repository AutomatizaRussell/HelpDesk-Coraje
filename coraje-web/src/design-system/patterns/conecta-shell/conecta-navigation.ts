import {
  BookOpen,
  Building2,
  CircleUser,
  ClipboardList,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  Receipt,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { ConectaModule } from "./conecta-modules";

/**
 * Menú del portal de empleados de Conecta, replicado dentro de HelpDesk.
 *
 * Copia de `SIDEBAR_CONFIG.empleado` en
 * `RBGCT-REACT/frontend/src/components/layout/sidebarConfig.js`, con las
 * condiciones de `RoleSidebar.jsx`, en el commit que fija
 * `conecta-upstream.json`. Si Conecta cambia su menú, `pnpm conecta:diff`
 * muestra el cambio y este archivo es lo que se actualiza, junto con la
 * referencia.
 *
 * **Visibilidad**, igual que en Conecta: cada condición es un módulo de la
 * lista que su backend calcula (`conecta-modules.ts`). HelpDesk la recibe del
 * perfil de Conecta ya cotejado en servidor y **solo decide qué se muestra**:
 * Conecta protege sus propias rutas.
 *
 * - **Formación** no aparece: Conecta la muestra si hay cursos vigentes, y lo
 *   calcula su navegador con su propio token, que HelpDesk no toca
 *   (specs/integracion-conecta.md §5, pendiente).
 * - **Analitica** no aparece: ver `conecta-modules.ts`.
 *
 * Ítem activo: **Auto gestión**. HelpDesk no es una entrada del menú: su
 * acceso desde Conecta va en esa vista (decisión del usuario, 24-sep-2026;
 * design/sistema-helpdesk.md §2). Hasta el 06-nov-2026 el código no lo
 * marcaba, contra esa decisión.
 *
 * Las rutas son del dominio de Conecta, fuera del `basePath` de HelpDesk: el
 * shell las pinta con `<a>` y nunca con `<Link>`, que les antepondría
 * `/helpdesk`. Los accesos rápidos (`external`) abren pestaña nueva y llevan
 * el símbolo de su aplicación en lugar de un icono, como en Conecta. El menú
 * nombra el símbolo y el shell lo resuelve a imagen: así este archivo queda
 * como datos puros, sin importar archivos de imagen.
 */
export type ConectaAppSymbol = "sqf" | "audithub";

export type ConectaNavLink = {
  kind: "link";
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Símbolo propio de una aplicación externa, en su color. */
  symbol?: ConectaAppSymbol;
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

/** Etiqueta del rol que el menú del avatar muestra bajo el nombre. */
export const CONECTA_ROLE_LABEL = "Colaborador";

export function conectaNavigation(modules: readonly ConectaModule[]): ConectaNavSection[] {
  const can = (module: ConectaModule) => modules.includes(module);

  // «Mis clientes» es solo un grupo visual: aparece si queda algún hijo.
  const clientes: ConectaNavLink[] = [];
  if (can("sqf")) {
    clientes.push({ kind: "link", label: "Formularios SQF", href: "/app/sqf", icon: FileSpreadsheet });
  }
  if (can("seguimiento_facturacion")) {
    clientes.push({
      kind: "link",
      label: "Seguimiento Facturación",
      href: "/app/seguimiento-facturacion",
      icon: Receipt,
    });
  }
  if (can("tesoreria_ver")) {
    clientes.push({ kind: "link", label: "Tesorería BPO", href: "/app/tesoreria", icon: Landmark });
  }

  const miEspacio: ConectaNavEntry[] = [
    { kind: "link", label: "Mi resumen", href: "/app", icon: LayoutDashboard },
    { kind: "link", label: "Auto gestión", href: "/app/auto-gestion", icon: ClipboardList, current: true },
  ];
  if (clientes.length > 0) {
    miEspacio.push({ kind: "group", label: "Mis clientes", icon: Building2, children: clientes });
  }
  if (can("tesoreria_admin_ver")) {
    miEspacio.push({ kind: "link", label: "Tesorería Administración", href: "/app/tesoreria-admin", icon: Wallet });
  }
  miEspacio.push({ kind: "link", label: "Mi perfil", href: "/app/perfil", icon: CircleUser });

  const accesos: ConectaNavLink[] = [
    { kind: "link", label: "SQF", href: "https://app.sqfmanager.com/sign-in", symbol: "sqf", external: true },
  ];
  if (can("audithub")) {
    accesos.push({
      kind: "link",
      label: "AuditHub",
      href: "https://audithub.rbgct.cloud/login",
      symbol: "audithub",
      external: true,
    });
  }

  return [
    { label: "Mi espacio", items: miEspacio },
    {
      label: "Recursos",
      items: [
        { kind: "link", label: "Reglamento", href: "/app/comunicados", icon: BookOpen },
        { kind: "link", label: "Herramientas", href: "/app/utilidades", icon: Wrench },
      ],
    },
    { label: "Accesos rápidos", items: accesos },
  ];
}

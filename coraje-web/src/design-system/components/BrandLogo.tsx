import Image from "next/image";

import logo from "../../../public/rb-logo.png";
import { helpdeskTheme } from "../themes/helpdesk";
import { cn } from "../utilities/cn";

/**
 * Logotipo oficial de Russell Bedford (imagotipo azul oscuro del paquete de
 * marca), con las reglas del manual aplicadas por construcción:
 *
 * - **Espacio libre** del 20 % del ancho en todas las direcciones: lo pone el
 *   propio componente como relleno, así ninguna vista puede pegarle nada.
 * - **Ancho mínimo** de 30 mm (≈ 113 px): todos los anchos del tema lo
 *   superan.
 * - **Nada que se lea junto a él.** El componente no acepta texto hijo, y el
 *   texto alternativo es el nombre de la firma, sin añadidos.
 *
 * Importación estática, no ruta de `public/`: Next genera una URL con hash
 * bajo `/_next/static`, que antepone el `basePath` de HelpDesk por sí sola y
 * que el perímetro no intercepta (`proxy.ts`, `matcher`).
 */
const placements = {
  topbar: {
    frame: "p-logo-clear-topbar-compact lg:p-logo-clear-topbar",
    image: "w-logo-topbar-compact lg:w-logo-topbar",
    width: helpdeskTheme.size.logoTopbar,
  },
  sidebar: {
    frame: "p-logo-clear-sidebar",
    image: "w-logo-sidebar",
    width: helpdeskTheme.size.logoSidebar,
  },
  access: {
    frame: "p-logo-clear-access",
    image: "w-logo-access",
    width: helpdeskTheme.size.logoAccess,
  },
} as const;

export type BrandLogoPlacement = keyof typeof placements;

export function BrandLogo({ placement }: { placement: BrandLogoPlacement }) {
  const { frame, image, width } = placements[placement];
  // El ancho intrínseco sale del token (el mayor de la ubicación) para que el
  // optimizador genere variantes 1x/2x de ese tamaño y no del original de
  // 2422 px. El alto se deriva de la proporción real del archivo.
  const intrinsicWidth = Number.parseFloat(width);
  const intrinsicHeight = Math.round((intrinsicWidth * logo.height) / logo.width);

  return (
    <span className={cn("block shrink-0", frame)}>
      <Image
        src={logo}
        alt="Russell Bedford"
        width={intrinsicWidth}
        height={intrinsicHeight}
        className={cn("block h-auto", image)}
      />
    </span>
  );
}

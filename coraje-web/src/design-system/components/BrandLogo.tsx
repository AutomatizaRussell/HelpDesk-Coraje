import Image from "next/image";

import logoBlue from "../../../public/rb-logo.png";
import logoWhite from "../../../public/rb-logo-white.png";
import { helpdeskTheme } from "../themes/helpdesk";
import { cn } from "../utilities/cn";

/**
 * Logotipo oficial de Russell Bedford, en las dos versiones del paquete de
 * marca: azul oscuro para fondo claro y blanca para fondo oscuro (manual §1.2,
 * §3.3). Cada ubicación fija su versión: el sidebar es navy y el logo azul
 * desaparecería sobre él. Las reglas del manual se aplican por construcción:
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
    source: logoBlue,
    frame: "p-logo-clear-topbar-compact lg:p-logo-clear-topbar",
    image: "w-logo-topbar-compact lg:w-logo-topbar",
    width: helpdeskTheme.size.logoTopbar,
  },
  sidebar: {
    source: logoWhite,
    frame: "p-logo-clear-sidebar",
    image: "w-logo-sidebar",
    width: helpdeskTheme.size.logoSidebar,
  },
  access: {
    source: logoBlue,
    frame: "p-logo-clear-access",
    image: "w-logo-access",
    width: helpdeskTheme.size.logoAccess,
  },
} as const;

export type BrandLogoPlacement = keyof typeof placements;

export function BrandLogo({ placement }: { placement: BrandLogoPlacement }) {
  const { source, frame, image, width } = placements[placement];
  // El ancho intrínseco sale del token (el mayor de la ubicación) para que el
  // optimizador genere variantes 1x/2x de ese tamaño y no del original de
  // 2422 px. El alto se deriva de la proporción real del archivo.
  const intrinsicWidth = Number.parseFloat(width);
  const intrinsicHeight = Math.round((intrinsicWidth * source.height) / source.width);

  return (
    <span className={cn("block shrink-0", frame)}>
      <Image
        src={source}
        alt="Russell Bedford"
        width={intrinsicWidth}
        height={intrinsicHeight}
        className={cn("block h-auto", image)}
      />
    </span>
  );
}

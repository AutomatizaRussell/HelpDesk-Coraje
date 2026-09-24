import Image from "next/image";

import isotype from "../../../public/rb-isotype-white.png";
import { helpdeskTheme } from "../themes/helpdesk";

/**
 * Isotipo blanco de Russell Bedford (el globo), versión oficial del paquete de
 * marca, para la columna replegada del shell de Conecta.
 *
 * **Desviación consciente del manual, decidida por el usuario el 24-sep-2026.**
 * El manual (§4.1) admite el globo como motivo decorativo, no como logotipo
 * por derecho propio. Conecta lo usa así en su columna replegada, y HelpDesk
 * replica ese shell tal cual para que el paso entre módulos se lea continuo
 * (design/sistema-helpdesk.md §2). El logotipo completo sigue apareciendo al
 * desplegar el sidebar.
 *
 * Solo en blanco y solo sobre el navy del shell: no hay otra ubicación
 * prevista para él.
 */
export function BrandIsotype() {
  const size = Number.parseFloat(helpdeskTheme.size.isotype);
  return (
    <Image
      src={isotype}
      alt="Russell Bedford"
      width={size}
      height={size}
      className="mx-auto block size-isotype"
    />
  );
}

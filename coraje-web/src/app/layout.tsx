import type { Metadata } from "next";

import "./globals.css";

/**
 * Layout raíz.
 *
 * Reducido a lo indispensable al retirar el frontend heredado: las fuentes
 * Geist que traía eran las de la plantilla de Next, no una decisión de este
 * producto. La tipografía real —Lato, con pesos 400/500/600/700— está
 * decidida en docs/design/sistema-helpdesk.md §2 y se declara cuando exista
 * el contrato de diseño como código (U5), no antes y no aquí suelta.
 *
 * El nombre del producto es HelpDesk. `Coraje` era el nombre del módulo y de
 * la carpeta, y como título de la pestaña no le dice nada a nadie.
 */
export const metadata: Metadata = {
  title: "HelpDesk",
  description: "Mesa de ayuda: recepción, clasificación y seguimiento de tickets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

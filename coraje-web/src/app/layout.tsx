import type { Metadata } from "next";
import { Lato } from "next/font/google";

import "./globals.css";

/**
 * Lato, la fuente principal del manual de marca, con sus cortes reales.
 *
 * `weight` repite como literal los pesos de `design-system/foundations/
 * typography.ts` (`LATO_WEIGHTS`) porque next/font analiza estas opciones en
 * compilación y no acepta referencias. El validador del contrato comprueba
 * que ambos coincidan.
 *
 * Solo `latin` y solo estilo normal: next/font precarga cada archivo que se
 * le declara, y el español cabe entero en `latin`. La itálica que aprueba el
 * manual se añade cuando una vista la use — hoy el único texto en itálica,
 * el eslogan, va dentro de la imagen del logotipo.
 *
 * El `<html>` recibe la variable `--font-lato`, que `globals.css` convierte
 * en la familia de toda la aplicación, con Arial de respaldo.
 */
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

/**
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
    <html lang="es" className={lato.variable}>
      <body>{children}</body>
    </html>
  );
}

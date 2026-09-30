import type { ReactNode } from "react";

/**
 * Layout de /tickets con el slot `modal`, donde se abre «Nuevo ticket» sobre
 * la bandeja (`@modal/(.)nuevo`). No dibuja nada propio: cada vista sigue
 * poniendo su `AppFrame`.
 */
export default function TicketsLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

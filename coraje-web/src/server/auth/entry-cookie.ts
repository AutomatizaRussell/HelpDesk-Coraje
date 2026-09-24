import { cookies } from "next/headers";

import { openSecret, sealSecret } from "@/server/security/secret-box";

import { parseEntryContext, type EntryContext } from "./entry-context";

/**
 * Cookie que recuerda, durante la sesión, por dónde entró la persona
 * (`entry-context.ts`). La escribe el callback al admitir y la borra el
 * cierre de sesión.
 *
 * Sellada con la misma caja que el estado OIDC: no porque el contenido sea
 * secreto —es el nombre y el área de quien la lleva—, sino para que no se
 * pueda fabricar a mano un contexto que el servidor no emitió. Alterarla solo
 * cambiaría la apariencia del shell; aun así, lo que el servidor pinta debe
 * ser lo que el servidor decidió.
 */
export const ENTRY_COOKIE_NAME = "helpdesk_entry";

export function sealEntryContext(context: EntryContext): string {
  return sealSecret(JSON.stringify(context));
}

/** Contexto de la petición actual. Sin cookie o ilegible: `directo`. */
export async function readEntryContext(): Promise<EntryContext> {
  const store = await cookies();
  const sealed = store.get(ENTRY_COOKIE_NAME)?.value;
  if (!sealed) return { via: "directo" };
  try {
    return parseEntryContext(openSecret(sealed));
  } catch {
    return { via: "directo" };
  }
}

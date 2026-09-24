import { z } from "zod";

import { sanitizeLoginHint } from "./login-hint";

/**
 * Contexto de entrada a HelpDesk: por dónde llegó la persona y, si llegó
 * desde Conecta, lo que Conecta sabe de ella y HelpDesk no
 * (specs/integracion-conecta.md).
 *
 * **Dos modos, decididos al entrar y fijos durante la sesión:**
 *
 * - `conecta`: el navegador tiene sesión de Conecta. Se entra sin clics —la
 *   cuenta de Conecta se pasa a Microsoft como `login_hint`— y la aplicación
 *   se dibuja dentro del shell replicado de Conecta.
 * - `directo`: no hay sesión de Conecta. Se muestra la pantalla de ingreso, el
 *   botón obliga a elegir cuenta y la aplicación se dibuja con su propia
 *   barra, sin el shell de Conecta.
 *
 * **Origen de los datos de Conecta:** el `localStorage` que Conecta escribe en
 * el mismo origen (`gct_empleado`). Solo lo lee el navegador; `/ingreso` lo
 * envía por POST a `/api/auth/microsoft/start`, que lo valida aquí.
 *
 * **Reglas de uso, no negociables** (specs/integracion-conecta.md §4):
 *
 * 1. **Solo para mostrar, nunca para autorizar.** Es un dato que el navegador
 *    controla. Decide qué nombre se pinta y qué enlaces a Conecta aparecen;
 *    jamás un permiso de HelpDesk. Conecta protege sus propias rutas.
 * 2. **Solo si es de la misma persona.** El callback lo descarta si su correo
 *    no coincide con el de la cuenta admitida: en un navegador compartido no
 *    se muestra el nombre de otro empleado.
 * 3. **Mínimo.** Del objeto de Conecta se toman cinco datos, con límites de
 *    longitud; nada de tokens, ni de identificadores internos, ni del resto
 *    de la ficha.
 * 4. **Fallo cerrado.** Si falta, no valida o no coincide, HelpDesk usa sus
 *    propios datos. Nunca se rompe el ingreso por culpa de este contexto.
 */

/** Forma que envía `/ingreso`, tomada de `gct_empleado`. Todo es opcional
 *  salvo el correo: Conecta puede cambiar su objeto sin avisar. */
const conectaEmployeeSchema = z.object({
  correo_corporativo: z.string().max(254),
  primer_nombre: z.string().max(100).optional().nullable(),
  primer_apellido: z.string().max(100).optional().nullable(),
  nombre_area: z.string().max(100).optional().nullable(),
  nombre_cargo: z.string().max(100).optional().nullable(),
  acceso_sqf_clientes: z.boolean().optional().nullable(),
  acceso_sqf_contratos: z.boolean().optional().nullable(),
  acceso_sqf_facturacion: z.boolean().optional().nullable(),
  acceso_sqf_auditoria: z.boolean().optional().nullable(),
});

/** Lo que HelpDesk conserva de Conecta. */
export interface ConectaProfile {
  email: string;
  /** «Primer nombre + primer apellido», como lo pinta Conecta. */
  shortName: string | null;
  /** Área, o cargo si no hay área (misma regla que Conecta). */
  subtitle: string | null;
  /** Algún permiso SQF: hace visible «Mis clientes» en el menú de Conecta. */
  sqfAccess: boolean;
}

export type EntryContext =
  | { via: "conecta"; profile: ConectaProfile | null }
  | { via: "directo" };

const clean = (value: string | null | undefined) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Valida el JSON que envía `/ingreso`. Devuelve `null` ante cualquier cosa
 * que no sea un empleado de Conecta con correo válido — incluido un JSON
 * malformado o de tamaño excesivo.
 */
export function parseConectaProfile(raw: string | null | undefined): ConectaProfile | null {
  if (!raw || raw.length > 4096) return null;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = conectaEmployeeSchema.safeParse(json);
  if (!parsed.success) return null;

  const data = parsed.data;
  const email = sanitizeLoginHint(data.correo_corporativo);
  if (!email) return null;

  const shortName = [clean(data.primer_nombre), clean(data.primer_apellido)].filter(Boolean).join(" ");

  return {
    email,
    shortName: shortName || null,
    subtitle: clean(data.nombre_area) ?? clean(data.nombre_cargo),
    sqfAccess: Boolean(
      data.acceso_sqf_clientes ||
        data.acceso_sqf_contratos ||
        data.acceso_sqf_facturacion ||
        data.acceso_sqf_auditoria,
    ),
  };
}

/**
 * Regla 2: el perfil de Conecta solo sobrevive si es de la persona que
 * Microsoft y el directorio acaban de admitir.
 */
export function bindProfileToIdentity(
  profile: ConectaProfile | null | undefined,
  admittedEmail: string | null,
): ConectaProfile | null {
  if (!profile || !admittedEmail) return null;
  return profile.email === admittedEmail.trim().toLowerCase() ? profile : null;
}

/** Forma persistida en la cookie de entrada (sellada, ver `entry-cookie.ts`). */
const entryContextSchema = z.discriminatedUnion("via", [
  z.object({ via: z.literal("directo") }),
  z.object({
    via: z.literal("conecta"),
    profile: z
      .object({
        email: z.string(),
        shortName: z.string().nullable(),
        subtitle: z.string().nullable(),
        sqfAccess: z.boolean(),
      })
      .nullable(),
  }),
]);

/** Lee la cookie ya abierta. Cualquier forma inesperada equivale a `directo`. */
export function parseEntryContext(raw: string | null | undefined): EntryContext {
  if (!raw) return { via: "directo" };
  try {
    const parsed = entryContextSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { via: "directo" };
  } catch {
    return { via: "directo" };
  }
}

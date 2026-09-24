/**
 * Pista de cuenta para Microsoft Entra ID (`login_hint`).
 *
 * El problema que resuelve: con `prompt=none`, Entra solo puede devolver un
 * código sin preguntar si sabe **qué** cuenta usar. Un navegador con varias
 * cuentas corporativas abiertas (la personal más buzones compartidos, algo
 * habitual en la firma) responde `interaction_required` aunque todas tengan
 * sesión viva, y el empleado acaba en el selector de cuenta cada vez.
 *
 * De dónde sale: del correo de la sesión de Conecta en el mismo navegador
 * (`entry-context.ts`, specs/integracion-conecta.md §3). Nunca de una cookie
 * propia de HelpDesk: quien entra directo, sin Conecta, debe **elegir** cuenta
 * (decisión del 24-sep-2026), y una pista recordada se lo impediría.
 *
 * Qué no es: no es una credencial ni una prueba de identidad. Un valor
 * manipulado solo cambia la cuenta que Entra propone; la identidad la sigue
 * decidiendo el `id_token` validado y la admisión contra el directorio. Por
 * eso basta con sanearla, no con sellarla.
 */

/** Longitud máxima de una dirección de correo (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** Devuelve la pista normalizada, o `null` si no parece un correo. */
export function sanitizeLoginHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const hint = value.trim().toLowerCase();
  if (hint.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(hint)) return null;
  return hint;
}

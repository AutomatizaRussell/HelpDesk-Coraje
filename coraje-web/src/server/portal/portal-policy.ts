/**
 * Reglas del acceso de clientes que no necesitan base de datos
 * (specs/acceso-clientes.md §6, §7). Puro a propósito: son las reglas que más
 * importa probar, y así se prueban sin base (`portal-policy.test.mts`).
 *
 * Los valores de código son los de Impulsa, ya ejercitados allí (§6). Los de
 * vigencia son decisiones de HelpDesk y se nombran como tales.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * D3 (decisión del usuario, 28-sep-2026): el acceso no vence, pero un
 * navegador que pasa 180 días sin uso vuelve a pedir código. Quien ya no
 * trabaja en la empresa cliente pierde su correo corporativo y con él la
 * posibilidad de recibir el código: el acceso se cierra solo aunque nadie lo
 * revoque. Valor inicial elegido por el usuario, no medido.
 */
export const DEVICE_IDLE_DAYS = 180;
export const DEVICE_IDLE_MS = DEVICE_IDLE_DAYS * DAY_MS;

/**
 * La cookie del navegador dura lo máximo que los navegadores admiten
 * (Chrome recorta a 400 días). La regla de inactividad la aplica el
 * servidor en cada lectura, no la fecha de la cookie: una cookie que caducara
 * a los 180 días echaría también a quien entra cada semana, porque en un
 * render no se puede reescribir.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Leer el portal no debe costar una escritura por petición. */
export const DEVICE_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Vida de una invitación sin usar. La spec decía «hasta el vencimiento
 * máximo de acceso», que D3 eliminó: hacía falta un plazo propio. Valor
 * inicial, no medido: si caduca, quien administra accesos emite otra.
 */
export const INVITATION_TTL_DAYS = 14;
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * DAY_MS;

export const OTP_TTL_MINUTES = 10;
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 10;
export const OTP_MAX_ISSUES_PER_HOUR = 6;
export const OTP_CODE_PATTERN = /^\d{6}$/;

/**
 * Correo tal como se guarda y se compara: sin espacios y en minúsculas. La
 * base exige la misma forma (`chk_portal_contacto_correo_normalizado`), así
 * que dos maneras de escribir la misma dirección no pueden convivir.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** ¿Pasó el navegador más tiempo sin uso del que D3 admite? */
export function isDeviceIdle(ultimoUsoAt: Date, now: Date): boolean {
  return now.getTime() - ultimoUsoAt.getTime() > DEVICE_IDLE_MS;
}

export type PortalAccessDenial =
  | "SIN_DISPOSITIVO"
  | "DISPOSITIVO_REVOCADO"
  | "DISPOSITIVO_INACTIVO"
  | "AUTORIZACION_REVOCADA"
  | "AUTORIZACION_SIN_ACTIVAR"
  | "CONTACTO_INACTIVO"
  | "CLIENTE_INACTIVO";

export interface PortalAccessFacts {
  dispositivo: { estado: string; ultimoUsoAt: Date } | null;
  autorizacion: { estado: string; activadaAt: Date | null };
  contactoActivo: boolean;
  clienteActivo: boolean;
}

/**
 * Decide si un navegador puede entrar, a partir de lo que la base dice de él.
 * Devuelve `null` si puede, o el motivo exacto si no.
 *
 * El motivo es para el registro del servidor, **nunca** para la persona: del
 * lado externo todas las causas se ven igual (acceso-clientes.md §9, «un
 * mensaje de error honesto de más es una enumeración»).
 *
 * El orden importa solo para el registro; cualquier motivo deniega.
 * `AUTORIZACION_SIN_ACTIVAR` es la comprobación que cierra la brecha B2 de
 * Impulsa: un dispositivo válido no basta si la autorización a la que
 * pertenece nunca se activó por invitación o por código (§6, invariante).
 */
export function evaluatePortalAccess(facts: PortalAccessFacts, now: Date): PortalAccessDenial | null {
  const { dispositivo, autorizacion } = facts;
  if (!dispositivo) return "SIN_DISPOSITIVO";
  if (dispositivo.estado !== "ACTIVO") return "DISPOSITIVO_REVOCADO";
  if (isDeviceIdle(dispositivo.ultimoUsoAt, now)) return "DISPOSITIVO_INACTIVO";
  if (autorizacion.estado !== "ACTIVA") return "AUTORIZACION_REVOCADA";
  if (!autorizacion.activadaAt) return "AUTORIZACION_SIN_ACTIVAR";
  if (!facts.contactoActivo) return "CONTACTO_INACTIVO";
  if (!facts.clienteActivo) return "CLIENTE_INACTIVO";
  return null;
}

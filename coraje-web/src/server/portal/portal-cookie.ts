import { APP_BASE_PATH } from "@/server/auth/base-path";

/**
 * Nombres y ruta de las cookies del portal de clientes, en un módulo **sin
 * dependencias pesadas**: el perímetro (`src/proxy.ts`) corre en el borde y
 * necesita leer el nombre sin arrastrar Prisma. Es el mismo motivo por el que
 * existe `server/auth/session-cookie.ts`.
 */

/** Credencial opaca del navegador recordado (acceso-clientes.md §6). */
export const PORTAL_DEVICE_COOKIE = "helpdesk_portal_device";

/**
 * Referencia al desafío de código en curso, entre pedir el código y
 * escribirlo. No es un secreto: sin el código de seis dígitos que llegó al
 * correo no sirve de nada. Existe para que la URL no lleve el identificador
 * del desafío ni el correo de la persona.
 */
export const PORTAL_CHALLENGE_COOKIE = "helpdesk_portal_codigo";

/**
 * Las cookies del portal solo viajan a `/helpdesk/portal`. Ni la sesión de un
 * empleado llega al portal ni la credencial de un cliente llega a las rutas
 * de empleados: son identidades distintas y cada una tiene su perímetro.
 */
export const PORTAL_COOKIE_PATH = `${APP_BASE_PATH}/portal`;

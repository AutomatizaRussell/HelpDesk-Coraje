import type { Prisma } from "@/generated/prisma/client";

/**
 * Reglas del seguimiento de un ticket (U11, specs/tickets.md §11), en un solo
 * sitio: las usan los comandos que añaden observadores o piden validación y
 * las consultas que llenan el selector de personas. Si las dos cosas se
 * escribieran por separado, el selector ofrecería a alguien que el comando
 * rechaza, o al revés.
 */

/**
 * Quién puede seguir un ticket o recibir una solicitud de validación: una
 * persona activa, con rol en HelpDesk, que no sea el marcador histórico de un
 * buzón compartido (tickets.md §7.3).
 *
 * El rol se exige porque sin él la persona no puede entrar (la admisión la
 * rechaza): un observador que no puede abrir el ticket solo recibiría
 * correos con un enlace que no le sirve. Se exige que **exista**, no cuál
 * es: el rol no se compara fuera del autorizador.
 */
export const FOLLOWER_WHERE = {
  estadoActivo: true,
  esResponsableHistoricoNoIdentificado: false,
  rolAplicacion: { not: null },
} as const satisfies Prisma.DimPersonalWhereInput;

/**
 * Tope de personas que se añaden de una vez. Seguir un ticket es para unas
 * pocas personas concretas; una lista larga es una lista de distribución, y
 * cada nombre es un correo que sale del buzón de quien actúa (D6).
 */
export const MAX_OBSERVERS_PER_ACTION = 10;

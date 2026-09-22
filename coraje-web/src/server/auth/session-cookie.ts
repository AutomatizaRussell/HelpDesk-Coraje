/**
 * Nombre de la cookie de sesión de empleado, en un módulo **sin ninguna
 * dependencia**.
 *
 * Vivía junto al resto de la sesión, y ahí no puede quedarse: el perímetro
 * (`src/proxy.ts`) necesita leerla y corre en el runtime del borde, donde
 * `employee-session.ts` no puede cargarse porque arrastra el cliente de
 * Prisma. La alternativa habitual —escribir el literal otra vez en el
 * proxy— crea dos verdades sobre el mismo nombre: el día que una cambie sin
 * la otra, el perímetro dejará pasar a todo el mundo como anónimo, y lo hará
 * en silencio.
 */
export const SESSION_COOKIE_NAME = "helpdesk_employee_session";

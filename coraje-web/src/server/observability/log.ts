/**
 * Registro estructurado del servidor (U10, docs/specs/observabilidad.md §5).
 *
 * Cada llamada escribe **una línea JSON** en la salida del contenedor, que es
 * lo que `docker logs` y Coolify ya guardan: no hay agente, archivo ni
 * servicio nuevo que mantener (CLAUDE.md, economía de recursos).
 *
 * Por qué una línea JSON y no `console.error("[correo] …", error)`:
 * - se filtra por campo (`evento`, `idTicket`) en vez de por texto libre;
 * - el identificador de correlación va siempre con el mismo nombre. Un
 *   `idTicket` en esta línea es el mismo `id_ticket` de la cola, de la
 *   referencia y de las divergencias, y su código es el `Id_Req` del ítem de
 *   HelpDeskBd: con eso se sigue un ticket de punta a punta sin inventar un
 *   identificador nuevo (decisión O6);
 * - lo que no debe salir, no sale: los campos con nombre de secreto se
 *   omiten, y los tokens reconocibles se borran también del texto de los
 *   errores. Nunca se registran cuerpos de correo, códigos ni enlaces.
 *
 * Es el único archivo del servidor que puede llamar a `console.*`; una
 * prueba (`log.test.mts`) lo exige.
 */

export type LogLevel = "info" | "warn" | "error";

/** Solo valores planos: un objeto anidado es donde se cuela un secreto sin nombre. */
export type LogValue = string | number | boolean | null | undefined;

/**
 * Campos de la línea. Los de correlación tienen nombre fijo para que dos
 * módulos no llamen distinto a lo mismo.
 */
export interface LogFields {
  idTicket?: string;
  idPersonal?: string;
  idContacto?: string;
  idNotificacion?: string;
  [campo: string]: LogValue;
}

const OMITTED = "[omitido]";
const MAX_TEXT = 500;
const MAX_STACK = 2000;

/**
 * Nombres de campo que nunca se escriben, sea cual sea su valor. Se compara
 * sin mayúsculas y por inclusión: `refreshTokenSealed`, `x-coraje-secret` o
 * `cuerpoHtml` caen todos.
 */
const SECRET_FIELD = /token|secret|secreto|password|contrase|clave|cookie|authorization|otp|cuerpo|body|html|enlace|link/i;

/**
 * Formas de secreto reconocibles dentro de un texto: cabecera Bearer, un JWT
 * (tres segmentos base64url empezando por `eyJ`) y parámetros de consulta con
 * nombre de secreto (`?code=…`, `&sig=…`).
 */
const SECRET_IN_TEXT: readonly RegExp[] = [
  /Bearer\s+[\w.~+/-]+=*/gi,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /([?&](?:code|token|access_token|refresh_token|id_token|sig|secret|key)=)[^&\s"']+/gi,
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Borra de un texto lo que tenga forma de secreto. */
export function scrubText(text: string): string {
  let out = text;
  for (const pattern of SECRET_IN_TEXT) {
    out = out.replace(pattern, (match, prefix?: string) => (typeof prefix === "string" && match.startsWith(prefix) ? `${prefix}${OMITTED}` : OMITTED));
  }
  return out;
}

function describeError(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    const out: Record<string, string> = { nombre: error.name, mensaje: truncate(scrubText(error.message), MAX_TEXT) };
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") out.codigo = String(code);
    if (error.stack) out.traza = truncate(scrubText(error.stack), MAX_STACK);
    return out;
  }
  return { mensaje: truncate(scrubText(String(error)), MAX_TEXT) };
}

/**
 * La línea tal como se escribe. Separada de `logEvent` para que la prueba
 * pueda comprobar qué sale sin capturar la consola.
 */
export function buildLogLine(level: LogLevel, evento: string, fields: LogFields = {}, error?: unknown, now: Date = new Date()): string {
  const line: Record<string, unknown> = { ts: now.toISOString(), nivel: level, evento };
  for (const [campo, valor] of Object.entries(fields)) {
    if (valor === undefined || campo in line) continue;
    if (SECRET_FIELD.test(campo)) line[campo] = OMITTED;
    else line[campo] = typeof valor === "string" ? truncate(scrubText(valor), MAX_TEXT) : valor;
  }
  if (error !== undefined) line.error = describeError(error);
  return JSON.stringify(line);
}

/**
 * Registra un evento del servidor.
 *
 * `evento` es un nombre estable `dominio.que_paso` (`correo.graph_rechazo`,
 * `espejo.kick_fallido`): es por lo que se filtra, así que no lleva datos.
 * Los datos van en `fields`; el error, aparte, para que su traza no se
 * mezcle con los campos.
 */
export function logEvent(level: LogLevel, evento: string, fields: LogFields = {}, error?: unknown): void {
  const line = buildLogLine(level, evento, fields, error);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

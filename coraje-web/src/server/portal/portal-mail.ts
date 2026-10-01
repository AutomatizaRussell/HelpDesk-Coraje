import { z } from "zod";

/**
 * Entrega de los correos del portal a n8n (D4, decisión del usuario del
 * 28-sep-2026): un workflow del n8n de HelpDesk los envía por Microsoft Graph
 * desde el buzón sin dueño `automatizacionmedellin@`. El workflow versionado
 * es `n8n/HELPDESK - Portal - Enviar correo V3.json`.
 *
 * **Por qué el envío es síncrono y sin cola.** Estos correos llevan un
 * secreto (enlace de invitación o código). Una cola con reintento exigiría
 * guardar el mensaje hasta enviarlo, y el secreto con él, en contra de la
 * invariante 4 de acceso-clientes.md. Así que la aplicación lo entrega en el
 * momento y registra el resultado en `app.portal_auditoria`. Si n8n está
 * caído, el envío falla, queda auditado, y se repite emitiendo un secreto
 * nuevo (otra invitación, otro código). Es lo mismo que hace Impulsa con su
 * OTP (portal-otp.service.ts).
 *
 * **Lo que n8n no debe hacer: guardar el cuerpo.** n8n guarda por defecto los
 * datos de cada ejecución, y con ellos el código. El workflow versionado fija
 * `saveDataSuccessExecution` y `saveDataErrorExecution` en `none`, de modo
 * que no dependa de la configuración de la instancia (observación B8 de
 * Impulsa, acceso-seguro.md).
 *
 * Variables de entorno (Coolify): `N8N_PORTAL_MAIL_WEBHOOK_URL` y
 * `N8N_PORTAL_MAIL_SECRET`. Se leen en cada envío, no al importar: una
 * variable que falta falla en la operación que la necesita, con su nombre.
 */

/**
 * `ESCALAMIENTO` (U15) no es del portal: es el correo diario a un empleado
 * con pendientes sin atender (`notice-escalation.ts`). Va por este mismo
 * transporte porque sale del mismo buzón sin dueño, con la misma credencial
 * de n8n: un segundo workflow solo duplicaría la puesta en marcha. No lleva
 * secreto, pero hereda sin coste que n8n no guarde el cuerpo.
 */
export type PortalMailKind = "INVITACION" | "CODIGO" | "ESCALAMIENTO";

export class PortalMailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalMailError";
  }
}

const SEND_TIMEOUT_MS = 15_000;

/** Respuesta mínima que el workflow debe devolver para contar como aceptado. */
const acceptedSchema = z.object({
  ok: z.literal(true),
  accepted: z.literal(true),
  id: z.string(),
  executionId: z.union([z.string(), z.number()]).optional(),
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new PortalMailError(`${name} no está configurada.`);
  return value;
}

function webhookUrl(): string {
  const value = requiredEnv("N8N_PORTAL_MAIL_WEBHOOK_URL");
  // HTTPS obligatorio: el cuerpo lleva un enlace de un solo uso o un código.
  if (new URL(value).protocol !== "https:") {
    throw new PortalMailError("N8N_PORTAL_MAIL_WEBHOOK_URL debe usar HTTPS.");
  }
  return value;
}

/**
 * Entrega un correo a n8n y espera a que lo acepte.
 *
 * @param message.id identificador de correlación (la invitación o el
 *   desafío): n8n debe devolverlo igual, o la respuesta no cuenta.
 * @returns el id de ejecución de n8n, si lo informa, para la auditoría.
 * @throws {PortalMailError} si falta configuración, n8n no responde, o la
 *   respuesta no confirma este mismo envío. El mensaje no incluye el cuerpo.
 */
export async function sendPortalMail(message: {
  kind: PortalMailKind;
  id: string;
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(webhookUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-helpdesk-secret": requiredEnv("N8N_PORTAL_MAIL_SECRET"),
      },
      body: JSON.stringify({
        event: "helpdesk.portal.correo",
        version: 1,
        kind: message.kind,
        id: message.id,
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof PortalMailError) throw error;
    throw new PortalMailError("n8n no respondió al envío del correo.");
  }

  if (!response.ok) {
    throw new PortalMailError(`n8n rechazó el envío del correo (HTTP ${response.status}).`);
  }

  let parsed: z.infer<typeof acceptedSchema>;
  try {
    parsed = acceptedSchema.parse(await response.json());
  } catch {
    throw new PortalMailError("n8n respondió sin confirmar el envío del correo.");
  }
  // Una respuesta que confirma otro envío no confirma este.
  if (parsed.id !== message.id) {
    throw new PortalMailError("n8n confirmó un envío distinto del solicitado.");
  }
  return parsed.executionId === undefined ? null : String(parsed.executionId);
}

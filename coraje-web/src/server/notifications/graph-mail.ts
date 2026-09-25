import { GraphGrantUnavailableError, getGraphAccessTokenForEmployee } from "@/server/auth/graph-grant";

/**
 * Envío de un correo como un empleado, por Microsoft Graph (D6). Adaptado de
 * `graph-mail.service.ts` de Impulsa.
 *
 * La aplicación llama a Graph directamente y no a través de n8n: el mensaje
 * sale **como la persona**, con su token delegado, y pasar ese token a otro
 * sistema para que haga una sola petición HTTP repartiría una credencial
 * personal sin ganar nada.
 *
 * `saveToSentItems`: el correo queda en Elementos enviados de quien lo envió,
 * junto con el resto de su correspondencia.
 *
 * Sin adjuntos: el correo lleva el enlace al ticket, y los archivos se abren
 * en HelpDesk (decisión del 25-sep-2026). Así no aplica el límite de unos
 * 4 MB por mensaje de Graph y la aplicación no carga bytes para adjuntarlos.
 */

const GRAPH_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const GRAPH_TIMEOUT_MS = 10_000;

export interface MailMessage {
  subject: string;
  html: string;
  to: string;
}

/**
 * Fallo de envío. `message` está escrito para la persona que envió y se
 * guarda en el correo fallido; el detalle técnico va a los registros.
 */
export class MailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailSendError";
  }
}

export async function sendMailAsEmployee(params: { idPersonal: string; message: MailMessage }): Promise<void> {
  let accessToken: string;
  try {
    accessToken = await getGraphAccessTokenForEmployee(params.idPersonal);
  } catch (error) {
    if (error instanceof GraphGrantUnavailableError) throw new MailSendError(error.message);
    console.error("[correo] No se pudo obtener el token de Graph:", error);
    throw new MailSendError("No fue posible contactar a Microsoft para enviar el correo. Intenta reenviarlo en unos minutos.");
  }

  let response: Response;
  try {
    response = await fetch(GRAPH_SEND_MAIL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.message.subject,
          body: { contentType: "HTML", content: params.message.html },
          toRecipients: [{ emailAddress: { address: params.message.to } }],
        },
        saveToSentItems: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[correo] Fallo de red al contactar Graph:", error);
    throw new MailSendError("No fue posible contactar a Microsoft para enviar el correo. Intenta reenviarlo en unos minutos.");
  }

  if (response.status === 202) return;

  const detail = await response.text().catch(() => "");
  console.error(`[correo] Graph respondió ${response.status}: ${detail.slice(0, 500)}`);
  // 401/403: el token no sirve para enviar (consentimiento de Mail.Send
  // retirado o nunca dado). 429/5xx: pasajero. El resto: destinatario o
  // mensaje rechazado.
  if (response.status === 401 || response.status === 403) {
    throw new MailSendError("Microsoft no permitió enviar el correo desde tu cuenta. Cierra sesión en HelpDesk, vuelve a entrar y reenvíalo.");
  }
  if (response.status === 429 || response.status >= 500) {
    throw new MailSendError("Microsoft no pudo enviar el correo en este momento. Intenta reenviarlo en unos minutos.");
  }
  throw new MailSendError(`Microsoft rechazó el correo (${response.status}). Revisa la dirección del destinatario.`);
}

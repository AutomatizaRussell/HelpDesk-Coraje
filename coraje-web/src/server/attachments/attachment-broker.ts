import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { logEvent } from "@/server/observability/log";

import { ATTACHMENTS_FOLDER, MAX_ATTACHMENT_BYTES, attachmentProblem, storedNameFor } from "./attachment-rules";

/**
 * Puente con n8n para los adjuntos (specs/tickets.md §14.1-§14.2). Copia el
 * modelo del buzón de sugerencias de Impulsa
 * (`src/server/impulsa/sugerencias/sugerencias-carga.service.ts`), con las dos
 * correcciones de §14.1: ningún enlace para toda la organización y ningún
 * camino que lleve los bytes por la base.
 *
 * **La aplicación nunca toca los bytes.** Autoriza una carga, n8n abre una
 * sesión de carga de Graph en el OneDrive de `info.admingct@`, el navegador
 * sube los fragmentos directo a esa URL, y a PostgreSQL llegan solo metadatos
 * que n8n leyó de Graph. La VPS no carga con 25 MB por archivo (CLAUDE.md,
 * economía de recursos).
 *
 * Un solo workflow con cinco webhooks (`n8n/HELPDESK - Adjuntos V1.json`):
 * `sesion`, `confirmar`, `descarga`, `vista` y `organizar`, bajo la URL base de
 * `N8N_ADJUNTOS_WEBHOOK_URL`, con la cabecera `x-helpdesk-secret` que valida la
 * credencial «HelpDesk adjuntos · x-helpdesk-secret».
 */

/** Error que se puede mostrar tal cual a la persona. */
export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentError";
  }
}

export function isAttachmentError(error: unknown): error is AttachmentError {
  return error instanceof AttachmentError;
}

const BROKER_TIMEOUT_MS = 30_000;
const UNAVAILABLE = "Los adjuntos no están disponibles en este momento. Intenta de nuevo en unos minutos.";

type BrokerOperation = "sesion" | "confirmar" | "descarga" | "vista" | "organizar";

function brokerConfig(): { base: string; secret: string } {
  const base = process.env.N8N_ADJUNTOS_WEBHOOK_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.N8N_ADJUNTOS_SECRET?.trim();
  if (!base || !secret) {
    logEvent("error", "adjuntos.sin_configurar", { motivo: "Faltan N8N_ADJUNTOS_WEBHOOK_URL o N8N_ADJUNTOS_SECRET." });
    throw new AttachmentError(UNAVAILABLE);
  }
  // HTTPS obligatorio: la respuesta de `sesion` es una capacidad de escritura.
  if (new URL(base).protocol !== "https:") {
    logEvent("error", "adjuntos.sin_configurar", { motivo: "N8N_ADJUNTOS_WEBHOOK_URL debe usar HTTPS." });
    throw new AttachmentError(UNAVAILABLE);
  }
  return { base, secret };
}

/**
 * Llama a un webhook del broker y devuelve su cuerpo, o `null` si n8n no
 * respondió o respondió sin JSON. El par `operation` viaja para que la
 * respuesta se pueda atribuir a esta petición: n8n lo devuelve, y quien llama
 * descarta una respuesta que traiga otro.
 */
async function callBroker(operation: BrokerOperation, body: Record<string, unknown>): Promise<{ status: number; payload: unknown } | null> {
  const { base, secret } = brokerConfig();
  try {
    const response = await fetch(`${base}/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-helpdesk-secret": secret },
      body: JSON.stringify({ event: `helpdesk.adjuntos.${operation}`, version: 1, ...body }),
      cache: "no-store",
      signal: AbortSignal.timeout(BROKER_TIMEOUT_MS),
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  } catch (error) {
    logEvent("error", "adjuntos.broker_sin_respuesta", { operacion: operation }, error);
    return null;
  }
}

function operationPair(seed: string) {
  return { id: randomUUID(), idempotencyKey: createHash("sha256").update(`${seed}:v1`).digest("hex") };
}

/** La forma de error que devuelve n8n, solo para el registro. */
const brokerFailure = z.object({ code: z.string().optional(), message: z.string().optional() }).passthrough();

function logRejection(operation: BrokerOperation, status: number, payload: unknown) {
  const parsed = brokerFailure.safeParse(payload);
  logEvent("warn", "adjuntos.broker_rechazo", {
    operacion: operation,
    estadoHttp: status,
    codigo: parsed.success ? parsed.data.code : undefined,
    detalle: parsed.success ? parsed.data.message?.slice(0, 300) : undefined,
  });
}

// ---------------------------------------------------------------------------
// 1 · Sesión de carga
// ---------------------------------------------------------------------------

/** Una capacidad que el navegador usa una vez y que nadie guarda. */
export interface UploadSession {
  idCarga: string;
  uploadUrl: string;
  expiraEn: string;
}

const sessionResponse = z.object({
  ok: z.literal(true),
  operationId: z.string(),
  idempotencyKey: z.string(),
  session: z.object({ uploadUrl: z.url({ protocol: /^https$/ }), expiresAt: z.string() }),
});

/**
 * Autoriza un archivo y devuelve la URL a la que el navegador lo sube. La URL
 * **no se guarda**: caduca sola, y una copia en PostgreSQL sería una
 * credencial de escritura viva más allá de la petición que la justificó.
 *
 * Quien llama ya exigió sesión y permiso (attachment-actions.ts).
 */
export async function createUploadSession(file: { name: string; size: number }): Promise<UploadSession> {
  const problem = attachmentProblem(file);
  if (problem) throw new AttachmentError(problem);

  const idCarga = randomUUID();
  const storedName = storedNameFor(idCarga, file.name);
  const operation = operationPair(`${idCarga}:${storedName}:${file.size}`);
  const result = await callBroker("sesion", {
    operation,
    target: { folderPath: ATTACHMENTS_FOLDER },
    file: { storedName, sizeBytes: file.size },
  });
  if (!result) throw new AttachmentError(UNAVAILABLE);

  const parsed = sessionResponse.safeParse(result.payload);
  if (!parsed.success || parsed.data.operationId !== operation.id || parsed.data.idempotencyKey !== operation.idempotencyKey) {
    logRejection("sesion", result.status, result.payload);
    throw new AttachmentError(`No fue posible preparar la carga de ${file.name.trim()}.`);
  }
  const expira = new Date(parsed.data.session.expiresAt);
  if (Number.isNaN(expira.getTime()) || expira <= new Date()) {
    throw new AttachmentError(`No fue posible preparar la carga de ${file.name.trim()}.`);
  }
  return { idCarga, uploadUrl: parsed.data.session.uploadUrl, expiraEn: expira.toISOString() };
}

// ---------------------------------------------------------------------------
// 2 · Confirmación
// ---------------------------------------------------------------------------

/** Lo que el navegador informa cuando Graph aceptó el último fragmento. */
export const uploadedAttachmentSchema = z.object({
  idCarga: z.uuid(),
  nombre: z.string().trim().min(1).max(255),
  tamano: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  idObjeto: z.string().trim().min(1).max(200),
});
export type UploadedAttachment = z.infer<typeof uploadedAttachmentSchema>;

/** Un adjunto verificado contra Graph, listo para guardarse. */
export interface ConfirmedAttachment {
  nombreOriginal: string;
  nombreGuardado: string;
  tipoMime: string;
  tamanoBytes: number;
  driveItemId: string;
}

const confirmResponse = z.object({
  ok: z.literal(true),
  operationId: z.string(),
  object: z.object({ id: z.string().min(1), name: z.string(), sizeBytes: z.number().int(), mimeType: z.string() }),
});

/**
 * Comprueba un objeto subido y lo convierte en un adjunto. El navegador es el
 * único que conoce el id del objeto, y también el que menos autoridad tiene
 * para describirlo: n8n pregunta a Graph si es un archivo, si está en la
 * carpeta de adjuntos y si tiene el nombre y el tamaño autorizados. El nombre
 * esperado se recalcula aquí desde el id de carga, así que nadie confirma un
 * objeto que no se le autorizó.
 *
 * El tope se aplica otra vez contra lo que informa Graph: la sesión se crea
 * sin el total, y nada impide anunciar 10 MB y subir 300.
 */
async function confirmAttachment(adjunto: UploadedAttachment): Promise<ConfirmedAttachment> {
  const problem = attachmentProblem({ name: adjunto.nombre, size: adjunto.tamano });
  if (problem) throw new AttachmentError(problem);

  const storedName = storedNameFor(adjunto.idCarga, adjunto.nombre);
  const operation = operationPair(`${adjunto.idCarga}:${adjunto.idObjeto}`);
  const result = await callBroker("confirmar", {
    operation,
    target: { folderPath: ATTACHMENTS_FOLDER },
    object: { id: adjunto.idObjeto },
    expected: { storedName, sizeBytes: adjunto.tamano },
  });
  if (!result) throw new AttachmentError(UNAVAILABLE);

  const parsed = confirmResponse.safeParse(result.payload);
  if (!parsed.success || parsed.data.operationId !== operation.id) {
    logRejection("confirmar", result.status, result.payload);
    throw new AttachmentError(`${adjunto.nombre} no pudo verificarse y no se adjuntó. Vuelve a subirlo.`);
  }
  const objeto = parsed.data.object;
  if (objeto.name !== storedName || objeto.sizeBytes <= 0 || objeto.sizeBytes > MAX_ATTACHMENT_BYTES) {
    logEvent("warn", "adjuntos.objeto_no_coincide", { idCarga: adjunto.idCarga, tamano: objeto.sizeBytes });
    throw new AttachmentError(`${adjunto.nombre} no coincide con lo autorizado y no se adjuntó.`);
  }
  return {
    nombreOriginal: adjunto.nombre,
    nombreGuardado: objeto.name,
    tipoMime: objeto.mimeType || "application/octet-stream",
    tamanoBytes: objeto.sizeBytes,
    driveItemId: objeto.id,
  };
}

/**
 * Confirma todos los adjuntos de un envío, o ninguno. En serie y no en
 * paralelo: son llamadas a Graph, y lanzarlas juntas contra un servicio que ya
 * rechaza convierte un envío lento en cinco. El primero que falla detiene el
 * resto, porque el envío entero se va a rechazar: la persona sigue con el
 * formulario delante, y saber qué archivo falló le sirve más que un ticket con
 * evidencia faltante.
 */
export async function confirmAttachments(adjuntos: readonly UploadedAttachment[]): Promise<ConfirmedAttachment[]> {
  const confirmed: ConfirmedAttachment[] = [];
  for (const adjunto of adjuntos) confirmed.push(await confirmAttachment(adjunto));
  return confirmed;
}

// ---------------------------------------------------------------------------
// 3 · Descarga
// ---------------------------------------------------------------------------

const downloadResponse = z.object({
  ok: z.literal(true),
  operationId: z.string(),
  object: z.object({ downloadUrl: z.url({ protocol: /^https$/ }) }),
});

/**
 * URL de descarga de corta duración (`@microsoft.graph.downloadUrl`), sin
 * cabecera de autorización. Se pide en cada descarga y no se guarda: quien
 * tiene la URL tiene el archivo, así que solo se entrega después de que la
 * ruta comprobó que la persona puede ver ese adjunto.
 */
export async function getDownloadUrl(driveItemId: string): Promise<string> {
  const operation = operationPair(`${driveItemId}:${randomUUID()}`);
  const result = await callBroker("descarga", { operation, object: { id: driveItemId } });
  if (!result) throw new AttachmentError(UNAVAILABLE);
  const parsed = downloadResponse.safeParse(result.payload);
  if (!parsed.success || parsed.data.operationId !== operation.id) {
    logRejection("descarga", result.status, result.payload);
    throw new AttachmentError("No fue posible descargar el archivo. Intenta de nuevo en unos minutos.");
  }
  return parsed.data.object.downloadUrl;
}

// ---------------------------------------------------------------------------
// 4 · Vista previa (U29)
// ---------------------------------------------------------------------------

const previewResponse = z.object({
  ok: z.literal(true),
  operationId: z.string(),
  object: z.object({ previewUrl: z.url({ protocol: /^https$/ }) }),
});

/**
 * URL del visor de OneDrive para mostrar el archivo dentro de HelpDesk (PDF,
 * imágenes y Office, renderizados por Microsoft). Temporal, como la de
 * descarga, y con la misma regla: solo después de comprobar que la persona ve
 * el adjunto.
 */
export async function getPreviewUrl(driveItemId: string): Promise<string> {
  const operation = operationPair(`${driveItemId}:vista:${randomUUID()}`);
  const result = await callBroker("vista", { operation, object: { id: driveItemId } });
  if (!result) throw new AttachmentError(UNAVAILABLE);
  const parsed = previewResponse.safeParse(result.payload);
  if (!parsed.success || parsed.data.operationId !== operation.id) {
    logRejection("vista", result.status, result.payload);
    throw new AttachmentError("No fue posible mostrar el archivo. Puedes descargarlo.");
  }
  return parsed.data.object.previewUrl;
}

// ---------------------------------------------------------------------------
// 5 · Carpeta por ticket (U29)
// ---------------------------------------------------------------------------

/**
 * Mueve los adjuntos recién guardados a la carpeta del ticket
 * (`…/Adjuntos/ADM-202611-1`), a pedido del usuario del 03-nov-2026.
 * Se llama después del commit y **no puede fallar la acción**: si n8n no
 * responde, los archivos se quedan en la carpeta general, y como el id de
 * OneDrive no cambia al mover, la descarga y la vista previa siguen igual.
 */
export async function organizeAttachments(params: { codigoTicket: string; driveItemIds: readonly string[] }): Promise<void> {
  if (params.driveItemIds.length === 0) return;
  try {
    const operation = operationPair(`${params.codigoTicket}:${params.driveItemIds.join(",")}`);
    const result = await callBroker("organizar", {
      operation,
      target: { folderPath: ATTACHMENTS_FOLDER, folderName: params.codigoTicket },
      objects: params.driveItemIds,
    });
    if (!result || result.status >= 400) {
      logEvent("warn", "adjuntos.organizar_fallido", { codigo: params.codigoTicket, estadoHttp: result?.status });
    }
  } catch (error) {
    logEvent("warn", "adjuntos.organizar_fallido", { codigo: params.codigoTicket }, error);
  }
}

/**
 * Subida por fragmentos a una sesión de carga de Microsoft Graph, desde el
 * navegador. Los bytes van directo a la URL temporal: ni la aplicación ni n8n
 * los ven pasar.
 *
 * Versión reducida de `src/features/shared/fragmented-upload.ts` de Impulsa.
 * Se conserva lo que protege a una persona con mala conexión —reintentos con
 * espera creciente, un tope por fragmento para que una petición colgada no
 * deje la barra girando, y distinguir «no se pudo leer el archivo» de «falló
 * la red»—. Se quita la pausa, la reanudación y el sondeo de la sesión: con
 * 25 MB como máximo, volver a subir sale más barato que mantener ese estado.
 */

/** Graph exige fragmentos múltiplos de 320 KiB. 10 × 320 KiB = 3,2 MB. */
const GRAPH_FRAGMENT_QUANTUM = 320 * 1024;
const FRAGMENT_BYTES = 10 * GRAPH_FRAGMENT_QUANTUM;
const MAX_RETRIES = 4;
/** Dos minutos por fragmento: 3,2 MB caben en una conexión de unos 27 KB/s. */
const FRAGMENT_TIMEOUT_MS = 120_000;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** Primer byte que Graph dice que le falta, de `nextExpectedRanges`. */
function nextExpectedByte(ranges: unknown, total: number): number {
  if (!Array.isArray(ranges) || ranges.length === 0) return total;
  const starts = ranges.map((range) => Number(/^(\d+)/.exec(String(range))?.[1]));
  const next = Math.min(...starts);
  if (!Number.isSafeInteger(next) || next < 0 || next > total) throw new UploadError("OneDrive devolvió un rango de carga inválido.");
  return next;
}

/** 408, 429 y 5xx se reintentan; 507 (OneDrive lleno) no se arregla reintentando. */
function isTransient(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status !== 507);
}

function waitMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (retryAfter !== null && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  return Math.min(1000 * 2 ** attempt, 30_000);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new UploadError("Carga cancelada."));
    }, { once: true });
  });
}

/**
 * Lee el fragmento antes de enviarlo. Un `Blob` ilegible hace que `fetch`
 * falle igual que una red caída; leerlo primero es lo que permite decirle a la
 * persona que vuelva a elegir el archivo (lo movió, lo guardó otra vez) en
 * lugar de culpar a la conexión.
 */
async function readFragment(file: File, start: number, end: number): Promise<ArrayBuffer> {
  try {
    return await file.slice(start, end).arrayBuffer();
  } catch {
    throw new UploadError(`No se pudo leer ${file.name}. Vuelve a elegirlo.`);
  }
}

/**
 * Sube el archivo y devuelve el id del objeto que Graph creó, que es lo único
 * que el servidor necesita para confirmarlo.
 *
 * @param onProgress porcentaje entero, tras cada fragmento aceptado.
 */
export async function uploadInFragments(params: {
  file: File;
  uploadUrl: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { file, uploadUrl, onProgress, signal } = params;
  if (!uploadUrl.startsWith("https://")) throw new UploadError("La sesión de carga no usa HTTPS.");
  let offset = 0;
  onProgress?.(0);

  while (offset < file.size) {
    if (signal?.aborted) throw new UploadError("Carga cancelada.");
    const end = Math.min(offset + FRAGMENT_BYTES, file.size);
    const body = await readFragment(file, offset, end);
    let response: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const relay = () => controller.abort();
      signal?.addEventListener("abort", relay, { once: true });
      const timer = window.setTimeout(() => controller.abort(), FRAGMENT_TIMEOUT_MS);
      try {
        response = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
          body,
          signal: controller.signal,
        });
      } catch {
        if (signal?.aborted) throw new UploadError("Carga cancelada.");
        response = null;
      } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", relay);
      }

      if (response && !isTransient(response.status)) break;
      if (attempt === MAX_RETRIES) break;
      await sleep(waitMs(attempt, response?.headers.get("Retry-After") ?? null), signal);
    }

    if (!response) throw new UploadError("No hubo respuesta de OneDrive. Revisa tu conexión y vuelve a intentarlo.");
    const payload = (await response.json().catch(() => null)) as { id?: string; nextExpectedRanges?: unknown } | null;

    if (response.status === 200 || response.status === 201) {
      if (!payload?.id) throw new UploadError("OneDrive terminó la carga sin devolver el archivo.");
      onProgress?.(100);
      return payload.id;
    }
    if (response.status !== 202) {
      throw new UploadError(`OneDrive rechazó ${file.name} (HTTP ${response.status}).`);
    }
    const next = nextExpectedByte(payload?.nextExpectedRanges, file.size);
    if (next <= offset) throw new UploadError("OneDrive no avanzó la carga.");
    offset = next;
    onProgress?.(Math.min(99, Math.floor((offset / file.size) * 100)));
  }

  throw new UploadError("La carga terminó sin devolver el archivo.");
}

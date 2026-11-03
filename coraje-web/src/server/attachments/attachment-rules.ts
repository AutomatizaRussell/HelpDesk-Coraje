/**
 * Reglas de los adjuntos del ticket (specs/tickets.md §14.4). Funciones puras,
 * sin red ni base: las usan por igual el navegador, para avisar antes de
 * subir, y el servidor, que es quien las hace cumplir.
 *
 * El tipo se decide por la **extensión**, no por el `type` que declara el
 * navegador. En Windows un `.csv` llega como `application/vnd.ms-excel` y un
 * `.zip` como `application/x-zip-compressed`, y a veces no llega nada: validar
 * el MIME del navegador rechazaría archivos buenos. OneDrive también deduce el
 * tipo de la extensión, así que el tipo que se guarda (el que informa Graph al
 * confirmar) y el que se validó aquí no pueden divergir.
 */

/** 5 archivos por envío y 25 MB por archivo (decisión del 06-oct-2026). */
export const MAX_ATTACHMENTS_PER_SUBMIT = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Lo que admite HelpDesk, por extensión en minúsculas. */
export const ALLOWED_EXTENSIONS = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  zip: "application/zip",
} as const satisfies Record<string, string>;

/** Para el atributo `accept` del selector de archivos. */
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_EXTENSIONS)
  .map((extension) => `.${extension}`)
  .join(",");

/**
 * Carpeta del OneDrive de `info.admingct@` donde viven todos los adjuntos,
 * relativa a su raíz («Mis archivos»). La eligió el usuario el 03-nov-2026.
 * El workflow codifica cada segmento (la tilde incluida) y compara la ruta sin
 * distinguir mayúsculas.
 */
export const ATTACHMENTS_FOLDER = "Documentación Nube/HelpDesk/Adjuntos";

/** Tope del nombre guardado (§14.3), con margen para el sufijo. */
const MAX_STORED_NAME = 180;
/** Lo que OneDrive no admite en un nombre, más los caracteres de control. */
const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

export function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

export function isAllowedName(name: string): boolean {
  const extension = extensionOf(name);
  return extension !== null && extension in ALLOWED_EXTENSIONS;
}

/** Tamaño para personas: «820 KB», «3,4 MB». */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Por qué un archivo no se admite, o `null` si se admite. La frase nombra el
 * archivo: con cinco en la lista, «formato no admitido» no dice cuál.
 */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  const name = file.name.trim();
  if (!name) return "El archivo no tiene nombre.";
  if (!isAllowedName(name)) {
    return `${name}: ese tipo de archivo no se admite. Se admiten PDF, imágenes, Word, Excel, PowerPoint, CSV y ZIP.`;
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return `${name} está vacío.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${name} supera los ${formatBytes(MAX_ATTACHMENT_BYTES)} permitidos.`;
  return null;
}

/**
 * Nombre con que se guarda en OneDrive: el original saneado, con un sufijo de
 * la carga antes de la extensión. El sufijo hace único el nombre en una
 * carpeta compartida por todos los tickets, y la confirmación lo vuelve a
 * calcular para exigir que el objeto sea exactamente el que se autorizó.
 *
 * @param idCarga uuid de la carga; se usan sus 12 primeros caracteres
 *   hexadecimales.
 */
export function storedNameFor(idCarga: string, originalName: string): string {
  const extension = extensionOf(originalName);
  if (!extension) throw new Error("storedNameFor: el nombre no tiene extensión");
  const suffix = idCarga.replace(/-/g, "").slice(0, 12).toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(suffix)) throw new Error("storedNameFor: idCarga no es un uuid");

  const base = originalName
    .trim()
    .slice(0, originalName.trim().length - extension.length - 1)
    .replace(FORBIDDEN_CHARACTERS, "_")
    .replace(/\s+/g, " ")
    // OneDrive tampoco admite nombres que terminan en punto o espacio.
    .replace(/[. ]+$/, "")
    .trim();
  const room = MAX_STORED_NAME - suffix.length - extension.length - 2;
  return `${(base || "archivo").slice(0, room)}-${suffix}.${extension}`;
}

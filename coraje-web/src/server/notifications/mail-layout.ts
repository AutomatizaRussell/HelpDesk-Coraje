import { helpdeskEmailTheme } from "@/design-system/themes/helpdesk-email";
import { publicAssetUrl } from "@/server/auth/conecta-return";

/**
 * El único layout con el que se dibuja un correo de HelpDesk, a empleados y a
 * contactos de clientes. Adaptado de `client-email-layout.ts` de Impulsa.
 *
 * **Bloques, no cadenas.** Quien compone un correo (`ticket-mail-content.ts`,
 * `portal-mail-content.ts`) dice solo *qué* lleva —un título, párrafos, una
 * cita, un botón, un código— y este módulo decide cómo se ve, leyendo cada
 * valor de `helpdeskEmailTheme`. Así los correos no se separan entre sí ni de
 * la aplicación, y ninguno escribe un color a mano.
 *
 * **Por qué el HTML parece de 2005.** Outlook clásico pinta con el motor de
 * Word: sin flexbox, sin grid, sin variables CSS, sin `max-width` en un `div`,
 * sin relleno en un `<a>`. Lo que sobrevive en todos los clientes son tablas
 * `role="presentation"` anidadas, con estilos en línea y `width`/`height`
 * explícitos, y eso es lo que se emite:
 * - una columna fija, envuelta en una tabla «fantasma» solo para Outlook,
 *   porque Word ignora `max-width`;
 * - un botón a prueba de Outlook: un `roundrect` VML para Word, que no sabe
 *   rellenar ni redondear un enlace, y un `<a>` con relleno para el resto;
 * - la familia de respaldo forzada para Outlook, que sin ella cae en Times
 *   New Roman cuando no tiene Lato.
 *
 * **Todo texto se escapa aquí.** Los bloques reciben texto plano, nunca HTML:
 * una descripción con `<script>` o un enlace disfrazado no puede volverse
 * contenido activo en el correo de otra persona, y ningún compositor tiene
 * que acordarse de escapar.
 *
 * Puro, sin I/O: el marcado se comprueba con una prueba sin red.
 */

/** Un tramo de un párrafo; `{ strong }` es el único énfasis que usa un mensaje. */
export type MailInline = string | { strong: string };

export type MailBlock =
  /** «Hola, {nombre}:». Solo en los correos a contactos de clientes. */
  | { kind: "greeting"; name: string }
  /** Lo que pasó, en una línea, con la raya de la marca debajo. Uno por mensaje, al principio. */
  | { kind: "title"; text: string }
  | { kind: "paragraph"; parts: MailInline[] }
  /**
   * Lo que escribió una persona (la descripción, la respuesta, lo que se pide
   * aprobar), apartado del texto del sistema para que se lea como suyo. Se
   * conservan sus saltos de línea.
   */
  | { kind: "quote"; label: string; text: string }
  /** La acción del mensaje. A lo sumo uno por correo. */
  | { kind: "button"; label: string; href: string }
  /** Un código de un solo uso, grande para leerlo desde el teléfono. */
  | { kind: "code"; value: string }
  /** Aclaración secundaria, en letra pequeña y gris. */
  | { kind: "note"; text: string };

const t = helpdeskEmailTheme;
const color = t.color;

/** Nombre del producto en la cabecera, junto al logotipo de la firma. */
const PRODUCT_NAME = "HelpDesk";
export const MAIL_LOGO = { path: "/rb-logo.png", width: 400, height: 87, alt: "Russell Bedford" } as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto plano a HTML escapado, conservando los saltos de línea. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/** Estilo del texto corrido, repetido en cada celda porque Word no lo hereda con fiabilidad. */
const bodyText = `font-family:${t.fontFamily};font-size:${t.fontSize.body};line-height:${t.lineHeight.body};color:${color.text};`;
const smallText = `font-family:${t.fontFamily};font-size:${t.fontSize.small};line-height:${t.lineHeight.small};color:${color.textMuted};`;

function inline(parts: MailInline[]): string {
  return parts
    .map((part) =>
      typeof part === "string"
        ? escapeHtml(part)
        : `<strong style="color:${color.heading};">${escapeHtml(part.strong)}</strong>`,
    )
    .join("");
}

/** Cada bloque es su propia fila: el espacio es el relleno de una celda, nunca un margen que Word pueda descartar. */
function row(content: string, paddingBottom: number, style = bodyText): string {
  return `<tr><td style="padding:0 0 ${paddingBottom}px 0;${style}">${content}</td></tr>`;
}

/**
 * Una celda con fondo y no un borde ni un `<hr>`: Word dibuja exacta una
 * celda rellena y añade relleno a los otros dos. El tamaño de letra y el
 * interlineado fijan la altura, que Word subiría a la de una línea normal.
 */
function renderTitleRule(): string {
  const { width, height } = t.titleRule;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${width}" height="${height}" style="width:${width}px;height:${height}px;background-color:${color.accent};font-size:${height}px;line-height:${height}px;border-radius:${t.radius.pill};">&nbsp;</td></tr></table>`;
}

function renderQuote(label: string, text: string): string {
  const { x, y, labelGap } = t.space.quote;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:${color.sunken};border-left:${t.quoteRule}px solid ${color.accent};padding:${y}px ${x}px;"><div style="${smallText}font-weight:bold;letter-spacing:${t.letterSpacing.eyebrow};text-transform:uppercase;padding:0 0 ${labelGap}px 0;">${escapeHtml(label)}</div><div style="${bodyText}">${multiline(text)}</div></td></tr></table>`;
}

function renderButton(label: string, href: string): string {
  const { x, y, height, vmlMinWidth, vmlCharWidth } = t.space.button;
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  // Word no ajusta una forma VML a su texto: el ancho se estima por el largo
  // de la etiqueta. La mitad `<!--[if !mso]>` se oculta a Outlook para que el
  // botón no salga dos veces.
  const vmlWidth = Math.max(vmlMinWidth, Math.round(label.length * vmlCharWidth + x * 2));
  const vmlArc = Math.round((Number.parseInt(t.radius.control, 10) / height) * 100);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:${height}px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="${vmlArc}%" stroke="f" fillcolor="${color.action}"><w:anchorlock/><center style="color:${color.onAction};font-family:${t.fallbackFontFamily};font-size:${t.fontSize.body};font-weight:bold;">${safeLabel}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${safeHref}" style="display:inline-block;background-color:${color.action};color:${color.onAction};font-family:${t.fontFamily};font-size:${t.fontSize.body};font-weight:bold;line-height:${height - y * 2}px;padding:${y}px ${x}px;border-radius:${t.radius.control};text-decoration:none;">${safeLabel}</a><!--<![endif]-->`;
}

function renderCode(value: string): string {
  const pad = t.space.code;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:${color.sunken};border:${t.border}px solid ${color.line};border-radius:${t.radius.control};padding:${pad}px ${pad * 2}px;font-family:${t.fontFamily};font-size:${t.fontSize.code};line-height:${t.lineHeight.code};font-weight:bold;letter-spacing:${t.letterSpacing.code};color:${color.heading};">${escapeHtml(value)}</td></tr></table>`;
}

function renderBlock(block: MailBlock, isLast: boolean): string {
  const bottom = isLast ? 0 : t.space.block;
  switch (block.kind) {
    case "greeting": {
      const name = block.name.trim();
      return row(name ? `Hola, ${escapeHtml(name)}:` : "Hola:", bottom);
    }
    case "title":
      return (
        row(
          escapeHtml(block.text),
          t.titleRule.gap,
          `font-family:${t.fontFamily};font-size:${t.fontSize.title};line-height:${t.lineHeight.title};font-weight:bold;color:${color.heading};`,
        ) + row(renderTitleRule(), bottom)
      );
    case "paragraph":
      return row(inline(block.parts), bottom);
    case "quote":
      return row(renderQuote(block.label, block.text), bottom);
    case "button":
      return row(renderButton(block.label, block.href), bottom);
    case "code":
      return row(renderCode(block.value), bottom);
    case "note":
      return row(multiline(block.text), bottom, smallText);
  }
}

/** Cabecera: el logotipo de la firma y, tras un divisor, el nombre del producto. */
function renderHeader(): string {
  const width = t.logoWidth;
  const height = Math.round((width * MAIL_LOGO.height) / MAIL_LOGO.width);
  const src = escapeHtml(publicAssetUrl(MAIL_LOGO.path));
  const gutter = t.space.gutter;
  return `<tr><td style="padding:${gutter}px ${gutter}px 0 ${gutter}px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding:0 ${t.space.block}px 0 0;"><img src="${src}" width="${width}" height="${height}" alt="${MAIL_LOGO.alt}" style="display:block;border:0;outline:none;text-decoration:none;width:${width}px;height:${height}px;font-family:${t.fontFamily};font-size:${t.fontSize.small};color:${color.heading};"></td><td valign="middle" style="border-left:${t.border}px solid ${color.line};padding:0 0 0 ${t.space.block}px;font-family:${t.fontFamily};font-size:${t.fontSize.eyebrow};line-height:${t.lineHeight.eyebrow};font-weight:bold;letter-spacing:${t.letterSpacing.eyebrow};text-transform:uppercase;color:${color.textMuted};">${PRODUCT_NAME}</td></tr></table></td></tr>`;
}

/**
 * Documento completo del correo.
 *
 * @param subject el asunto; algunos clientes lo muestran como título del documento.
 * @param blocks el contenido, en orden. El último no lleva espacio debajo.
 */
export function renderMail(subject: string, blocks: MailBlock[]): string {
  const body = blocks.map((block, index) => renderBlock(block, index === blocks.length - 1)).join("");
  const width = t.width;
  const gutter = t.space.gutter;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="es"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(subject)}</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><style>body,table,td,div,p,a,span,strong{font-family:${t.fallbackFontFamily} !important;}</style><![endif]--></head><body style="margin:0;padding:0;background-color:${color.canvas};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.canvas};"><tr><td align="center" style="padding:${gutter}px ${t.space.block}px;"><!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${width}px;background-color:${color.surface};border:${t.border}px solid ${color.line};border-radius:${t.radius.surface};">${renderHeader()}<tr><td style="padding:${gutter}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
}

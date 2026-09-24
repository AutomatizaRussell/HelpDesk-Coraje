import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { brandTint, brandPrimitives } from "./foundations/brand";
import { LATO_WEIGHTS } from "./foundations/typography";
import { helpdeskTheme } from "./themes/helpdesk";

/**
 * Validador ejecutable del contrato de diseño (design/sistema-helpdesk.md §3,
 * V1–V6; criterio de cierre de U5: «el validador falla si los dos adaptadores
 * divergen»).
 *
 * El contrato tiene dos materializaciones escritas a mano —el tema TypeScript
 * y el `:root` de `globals.css`— y nada en el compilador impide que se
 * separen: una divergencia no produce error, produce un color que nadie sabe
 * de dónde sale. Esta suite es lo que la convierte en error.
 *
 * Además barre el código de interfaz en busca de valores visuales escritos
 * fuera del contrato. Cada detector tiene su propia prueba con ejemplos
 * positivos y negativos: un detector que nunca dispara pasaría el barrido en
 * verde sin demostrar nada.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "..");
const GLOBALS_CSS = path.join(SRC_DIR, "app/globals.css");
const LAYOUT = path.join(SRC_DIR, "app/layout.tsx");

const css = readFileSync(GLOBALS_CSS, "utf8");

// ---------------------------------------------------------------------------
// Aplanado de los dos adaptadores
// ---------------------------------------------------------------------------

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Tema TS → `{ "--hd-color-canvas": "#f4f6f9", … }`, misma convención que el CSS. */
function flattenTheme(node: unknown, prefix = "--hd"): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const name = `${prefix}-${kebab(key)}`;
    if (value !== null && typeof value === "object") {
      for (const [k, v] of flattenTheme(value, name)) out.set(k, v);
    } else {
      out.set(name, String(value));
    }
  }
  return out;
}

function extractRootBlock(source: string): string {
  const match = source.match(/:root\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, "globals.css debe declarar un bloque :root con los valores del tema");
  return match[1];
}

function parseRootDeclarations(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of extractRootBlock(source).matchAll(/(--hd-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    assert.ok(!out.has(name), `${name} está declarada dos veces en :root`);
    out.set(name, value.trim());
  }
  return out;
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

test("los dos adaptadores declaran exactamente las mismas variables", () => {
  const fromTheme = new Set(flattenTheme(helpdeskTheme).keys());
  const fromCss = new Set(parseRootDeclarations(css).keys());

  const missingInCss = [...fromTheme].filter((name) => !fromCss.has(name));
  const missingInTheme = [...fromCss].filter((name) => !fromTheme.has(name));

  assert.deepEqual(missingInCss, [], "Variables del tema TS sin materializar en globals.css");
  assert.deepEqual(missingInTheme, [], "Variables de globals.css sin autoridad en el tema TS");
});

test("los dos adaptadores asignan el mismo valor a cada variable", () => {
  const fromCss = parseRootDeclarations(css);
  const drift = [...flattenTheme(helpdeskTheme)]
    .filter(([name, value]) => fromCss.has(name) && normalize(fromCss.get(name)!) !== normalize(value))
    .map(([name, value]) => `${name}: tema=${value} · css=${fromCss.get(name)}`);

  assert.deepEqual(drift, [], "Los adaptadores divergen");
});

test("toda referencia var(--hd-…) del código apunta a una variable declarada", () => {
  const declared = new Set(parseRootDeclarations(css).keys());
  const dangling: string[] = [];

  for (const file of listSourceFiles(SRC_DIR)) {
    // Las pruebas citan prefijos (`--hd-layer-`) en sus mensajes: no son referencias.
    if (file.endsWith(".test.mts")) continue;
    const source = readFileSync(file, "utf8");
    for (const [, name] of source.matchAll(/(--hd-[a-z0-9-]+)/g)) {
      if (!declared.has(name)) dangling.push(`${path.relative(SRC_DIR, file)} → ${name}`);
    }
  }

  assert.deepEqual([...new Set(dangling)], [], "Referencias a variables inexistentes");
});

test("el tema de Tailwind anula las familias por defecto antes de declarar las propias", () => {
  const theme = css.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const family of ["color", "font", "font-weight", "text", "radius", "shadow", "ease"]) {
    assert.match(theme, new RegExp(`--${family}-\\*:\\s*initial;`), `Falta anular --${family}-*`);
  }
});

// ---------------------------------------------------------------------------
// Marca y tipografía
// ---------------------------------------------------------------------------

test("las tintas se calculan con la fórmula del manual", () => {
  // Valores de referencia independientes de la función: las tintas de navy y
  // naranja publicadas en foundations/brand.ts de Impulsa, verificadas allí
  // contra las muestras del manual. Si la fórmula se rompe, esto lo detecta.
  assert.equal(brandTint(brandPrimitives.navy, 80), "#33468d");
  assert.equal(brandTint(brandPrimitives.navy, 20), "#ccd1e3");
  assert.equal(brandTint(brandPrimitives.earthOrange, 80), "#f1a233");
  assert.equal(brandTint(brandPrimitives.earthOrange, 20), "#fbe8cc");
});

test("Lato carga exactamente los pesos del contrato (V1)", () => {
  assert.deepEqual(LATO_WEIGHTS, ["400", "700", "900"]);

  // next/font exige literales en sus opciones, así que layout.tsx no puede
  // importar LATO_WEIGHTS: se comprueba que su literal coincida.
  const layout = readFileSync(LAYOUT, "utf8");
  const call = layout.match(/Lato\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  const weights = call.match(/weight:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const loaded = [...weights.matchAll(/"(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(loaded, [...LATO_WEIGHTS], "layout.tsx debe cargar los mismos pesos que el contrato");
  assert.match(call, /variable:\s*"--font-lato"/);
});

// ---------------------------------------------------------------------------
// Barrido de valores visuales fuera del contrato (V3, V6)
// ---------------------------------------------------------------------------

/** Archivos donde un literal visual es legítimo: son la autoridad. */
const AUTHORITIES = new Set([
  "design-system/foundations/brand.ts",
  "design-system/foundations/iconography.ts",
  "design-system/themes/helpdesk.ts",
]);

/**
 * Detectores. Cada uno nombra la regla que protege, para que el fallo diga
 * qué hacer y no solo qué línea es.
 */
const VIOLATIONS: { rule: string; pattern: RegExp }[] = [
  { rule: "color hexadecimal escrito a mano", pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { rule: "función de color escrita a mano", pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(/ },
  { rule: "medida en píxeles escrita a mano", pattern: /\b\d+(?:\.\d+)?px\b/ },
  { rule: "clase arbitraria de Tailwind (usa un token con nombre)", pattern: /\b[a-z][a-z0-9-]*-\[[^\]]+\]/ },
  { rule: "capa o duración numérica (usa --hd-layer-* / --hd-motion-*)", pattern: /\b(?:z|duration|delay)-\d/ },
  {
    rule: "paleta por defecto de Tailwind (anulada: no genera CSS)",
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|divide|decoration|placeholder|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/,
  },
  { rule: "peso sin corte real de Lato (solo normal, bold, black)", pattern: /\bfont-(?:thin|extralight|light|medium|semibold|extrabold)\b/ },
  { rule: "`font: inherit` restablece las recetas", pattern: /\bfont:\s*inherit\b/ },
  { rule: "tamaño o trazo de icono numérico (usa size-* y iconStroke)", pattern: /\b(?:size|strokeWidth)=\{\d/ },
  { rule: "estilo en línea (consume una clase del contrato)", pattern: /\bstyle=\{\{/ },
];

/**
 * Quita los comentarios antes de barrer: un comentario que explica por qué
 * `font-semibold` está prohibido no es un uso de `font-semibold`. Cada
 * comentario se sustituye por espacios conservando los saltos de línea, para
 * que el número de línea del fallo siga apuntando al sitio correcto. El `//`
 * de línea exige no ir precedido de `:` para no comerse una URL.
 */
function stripComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])(\/\/[^\n]*)/g, (_, lead, comment) => lead + blank(comment));
}

function findViolations(source: string): string[] {
  const found: string[] = [];
  stripComments(source).split("\n").forEach((line, index) => {
    for (const { rule, pattern } of VIOLATIONS) {
      if (pattern.test(line)) found.push(`línea ${index + 1}: ${rule} → ${line.trim()}`);
    }
  });
  return found;
}

test("los detectores disparan con lo que deben y callan con lo que no", () => {
  const mustFire = [
    'className="text-[#001871]"',
    'className="bg-slate-200"',
    'className="w-[240px]"',
    "color: rgba(0, 0, 0, 0.5);",
    'className="font-semibold"',
    'className="z-30 duration-200"',
    "<Menu size={18} />",
    "<div style={{ color: brand }} />",
    "font: inherit;",
    "padding: 12px;",
  ];
  for (const sample of mustFire) {
    assert.ok(findViolations(sample).length > 0, `Debió detectarse: ${sample}`);
  }

  const mustPass = [
    'className="bg-canvas text-ink font-bold"',
    'className="w-rail h-topbar lg:h-topbar-wide"',
    'className="z-(--hd-layer-topbar) duration-(--hd-motion-normal)"',
    'className="size-4.5 rounded-control"',
    'href="#contenido"',
    "/* `font-semibold` no existe en el contrato */",
    'const url = "https://conecta.rbgct.cloud/app"; // sin 12px ni #fff aquí',
  ];
  for (const sample of mustPass) {
    assert.deepEqual(findViolations(sample), [], `No debió detectarse: ${sample}`);
  }
});

test("ningún archivo de interfaz escribe valores visuales fuera del contrato", () => {
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");
    if (AUTHORITIES.has(relative) || relative.endsWith(".test.mts")) continue;

    let source = readFileSync(file, "utf8");
    // En globals.css, el bloque :root es el adaptador y puede llevar literales.
    if (relative === "app/globals.css") source = source.replace(extractRootBlock(source), "");

    for (const violation of findViolations(source)) offenders.push(`${relative} ${violation}`);
  }

  assert.deepEqual(offenders, [], "Valores visuales fuera del contrato");
});

test("todo anillo de foco declara su estilo de contorno", () => {
  // En Tailwind 4, `outline-hidden` fija --tw-outline-style: none y
  // `outline-2` reutiliza esa variable: sin `outline-solid` el anillo existe
  // pero no se ve. Defecto real observado en el despliegue (24-sep-2026).
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    if (file.endsWith(".test.mts")) continue;
    stripComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((line, index) => {
        if (/focus-visible:outline-\d/.test(line) && !/focus-visible:outline-solid/.test(line)) {
          offenders.push(`${path.relative(SRC_DIR, file)} línea ${index + 1}`);
        }
      });
  }
  assert.deepEqual(offenders, [], "Anillo de foco sin outline-solid: no se vería");
});

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // src/generated es el cliente de Prisma: código generado, fuera del contrato.
    if (entry === "generated" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(?:tsx?|mts|css)$/.test(entry)) out.push(full);
  }
  return out;
}

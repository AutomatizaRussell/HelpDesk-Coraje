import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyPath, isPublicPath, normalizeAppPathname, type PathAccess } from "./public-paths";

/**
 * Prueba del perímetro (`plan-ejecucion.md` §U4, criterio de cierre).
 *
 * Lo que se verifica aquí **no es que el proxy funcione** —eso exige un
 * servidor— sino algo que ninguna prueba de comportamiento puede dar: que la
 * clasificación entre público y privado cubra *todas* las rutas que el árbol
 * de `src/app` contiene hoy, y que siga cubriéndolas mañana.
 *
 * El mecanismo es un inventario declarado. La prueba recorre el sistema de
 * archivos, deriva la ruta de cada página y cada handler, y la contrasta con
 * la tabla de abajo. Una ruta nueva que nadie clasificó rompe la suite: quien
 * la añada tiene que escribir aquí si es pública o privada, y esa es
 * exactamente la decisión que el modelo anterior —cada página con su propio
 * guard— dejaba que se tomara por omisión.
 *
 * La prueba no puede importar `src/proxy.ts` (necesita el entorno de Next),
 * pero sí importa el módulo donde vive la regla que el proxy aplica, así que
 * no se está comprobando una copia.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(THIS_DIR, "../../app");

/**
 * Inventario completo y declarado de rutas de `src/app`.
 *
 * `acceso` debe corresponder, una a una, con lo que `classifyPath` decide:
 * - `PUBLICA`: pasa sin credencial;
 * - `PORTAL`: exige el navegador recordado de un contacto de cliente (U8);
 * - `EMPLEADO`: exige la sesión de un empleado.
 * Si alguien abre una ruta en el perímetro y se olvida de esta tabla —o al
 * revés— la prueba lo dice.
 */
const RUTAS_DECLARADAS: Record<string, { acceso: PathAccess; razon: string }> = {
  "/": {
    acceso: "EMPLEADO",
    razon: "Entrada de empleados: sin sesión pasa por /ingreso",
  },
  "/login": {
    acceso: "PUBLICA",
    razon: "La puerta. Se dibuja sin sesión por definición",
  },
  "/tickets": {
    acceso: "EMPLEADO",
    razon: "Bandeja de empleados; lo que lista lo acota el autorizador",
  },
  "/tickets/nuevo": {
    acceso: "EMPLEADO",
    razon: "Radicar un ticket propio exige sesión y el permiso ticket.crear",
  },
  "/tickets/[idTicket]": {
    acceso: "EMPLEADO",
    razon: "Detalle de un ticket dentro del alcance de ticket.consultar",
  },
  "/redirigir/[idTicket]": {
    acceso: "EMPLEADO",
    razon: "Redirigir al área un ticket del portal (T3); exige ticket.redirigir",
  },
  "/accesos": {
    acceso: "EMPLEADO",
    razon: "Buscar clientes para darles acceso; exige portal.acceso.administrar",
  },
  "/accesos/[idCliente]": {
    acceso: "EMPLEADO",
    razon: "Contactos e invitaciones de un cliente; exige portal.acceso.administrar",
  },
  "/salud": {
    acceso: "EMPLEADO",
    razon: "Revisión de salud y divergencias con PowerApps (U10); exige salud.consultar",
  },
  "/avisos": {
    acceso: "EMPLEADO",
    razon: "Avisos propios: lo que requiere atención y las novedades (U15); exige aviso.consultar",
  },
  "/api/avisos": {
    acceso: "EMPLEADO",
    razon: "Lo que muestra la campana al abrirse; solo avisos de quien la pide",
  },
  "/api/interno/avisos/escalar": {
    acceso: "PUBLICA",
    razon: "La llama n8n a diario; su credencial es un secreto en cabecera que la ruta comprueba",
  },
  "/ingreso": {
    acceso: "PUBLICA",
    razon: "Detecta en el navegador si hay sesión de Conecta y elige el modo de entrada",
  },
  "/api/auth/logout": {
    acceso: "EMPLEADO",
    razon: "Revoca la sesión de quien la trae; sin cookie no hay nada que hacer",
  },
  "/api/auth/microsoft/start": {
    acceso: "PUBLICA",
    razon: "Inicia el flujo OIDC: quien la pide todavía no tiene sesión",
  },
  "/api/auth/microsoft/callback": {
    acceso: "PUBLICA",
    razon: "Vuelta del proveedor, con el código que producirá la sesión",
  },
  "/portal": {
    acceso: "PORTAL",
    razon: "Las solicitudes que radicó el contacto (D2)",
  },
  "/portal/tickets/nuevo": {
    acceso: "PORTAL",
    razon: "Radicar (T1); la escritura exige además que el acceso no sea de solo lectura",
  },
  "/portal/tickets/[idTicket]": {
    acceso: "PORTAL",
    razon: "Una solicitud propia; la ajena responde como inexistente",
  },
  "/portal/ingreso": {
    acceso: "PUBLICA",
    razon: "Pedir código por correo: produce la identidad del portal y no revela si el correo existe",
  },
  "/portal/ingreso/codigo": {
    acceso: "PUBLICA",
    razon: "Escribir el código recibido; mismo motivo que el paso anterior",
  },
  "/portal/activar/[token]": {
    acceso: "PUBLICA",
    razon: "El enlace de invitación es la credencial; abrirlo no consume nada",
  },
};

/**
 * Símbolos que cuentan como "esta superficie resuelve identidad en servidor".
 *
 * Los tres pasan por `readEmployeeSession`, que es lo que relee el directorio
 * y reevalúa la admisión en cada petición. Comparar contra una lista cerrada
 * y no contra un patrón laxo evita que un nombre parecido —una función
 * propia llamada `checkUser`, por ejemplo— pase por segunda capa sin serlo.
 */
const SIMBOLOS_DE_IDENTIDAD = [
  "requireCurrentEmployee",
  "getCurrentEmployee",
  "revokeCurrentEmployeeSession",
];

/**
 * Lo mismo para el portal: los tres pasan por `resolvePortalAccess`, que
 * relee dispositivo, autorización, contacto y cliente en cada petición.
 */
const SIMBOLOS_DE_PORTAL = ["requirePortalAccess", "requirePortalWriteAccess", "signOutPortalDevice"];

/**
 * Server Actions anónimas **declaradas**. Son las que producen la identidad
 * del portal —pedir código, verificarlo, activar una invitación— y por eso no
 * pueden exigirla. Una acción anónima nueva tiene que añadirse aquí, con su
 * motivo, y eso es visible en la revisión del cambio.
 */
const ACCIONES_ANONIMAS: Record<string, string> = {
  "features/portal/entry-actions.ts":
    "Ingreso al portal: no devuelven datos, no revelan si un correo existe y validan un secreto que solo está en el correo de la persona",
};

type ArchivoDeRuta = { pathname: string; archivo: string };

/**
 * Deriva la ruta pública de un archivo de App Router.
 *
 * Los segmentos entre paréntesis son grupos de organización y no aparecen en
 * la URL; los corchetes sí, y se conservan tal cual porque lo que importa
 * aquí es la forma de la ruta, no un valor concreto.
 */
function pathnameDesdeArchivo(relativo: string): string {
  const segmentos = path
    .dirname(relativo)
    .split(path.sep)
    // Tampoco aparecen en la URL: los slots de rutas paralelas (`@modal`) y
    // el prefijo de una ruta interceptada (`(.)nuevo` es `nuevo` abierta sobre
    // la vista actual). Una ruta interceptada responde en la misma URL que la
    // original, así que se clasifica igual y tiene que resolver identidad igual.
    .filter((s) => s !== "." && !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"))
    .map((s) => s.replace(/^(?:\(\.{1,3}\))+/, ""));
  return segmentos.length === 0 ? "/" : `/${segmentos.join("/")}`;
}

function recorrerRutas(dir: string, base = ""): ArchivoDeRuta[] {
  const encontradas: ArchivoDeRuta[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const relativo = path.join(base, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...recorrerRutas(path.join(dir, entrada.name), relativo));
      continue;
    }
    if (entrada.name === "page.tsx" || entrada.name === "route.ts") {
      encontradas.push({
        pathname: pathnameDesdeArchivo(relativo),
        archivo: path.join(dir, entrada.name),
      });
    }
  }
  return encontradas;
}

/**
 * Recorre **todo** `src/`, no solo `src/app`.
 *
 * Una Server Action no tiene por qué vivir junto a una ruta: al retirar el
 * frontend heredado, la de redirección se movió a `src/features/` y ahí
 * seguiría siendo un endpoint en cuanto una vista volviera a importarla. La
 * propiedad que se verifica —resuelve identidad por su cuenta— depende del
 * archivo, no de dónde esté guardado.
 */
function recorrerServerActions(dir: string): string[] {
  const encontradas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== "generated") {
        encontradas.push(...recorrerServerActions(completo));
      }
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
    if (readFileSync(completo, "utf8").includes('"use server"')) {
      encontradas.push(completo);
    }
  }
  return encontradas;
}

const RUTAS_EN_DISCO = recorrerRutas(APP_DIR);

test("el inventario declarado cubre exactamente las rutas que existen", () => {
  const enDisco = RUTAS_EN_DISCO.map((r) => r.pathname).sort();
  const declaradas = Object.keys(RUTAS_DECLARADAS).sort();

  const sinDeclarar = enDisco.filter((p) => !declaradas.includes(p));
  const fantasmas = declaradas.filter((p) => !enDisco.includes(p));

  assert.deepEqual(
    sinDeclarar,
    [],
    `Rutas nuevas sin clasificar en el perímetro: ${sinDeclarar.join(", ")}. ` +
      "Declárala pública o privada en RUTAS_DECLARADAS antes de publicarla.",
  );
  assert.deepEqual(
    fantasmas,
    [],
    `Rutas declaradas que ya no existen: ${fantasmas.join(", ")}.`,
  );
});

test("el perímetro clasifica cada ruta igual que el inventario", () => {
  for (const [pathname, { acceso, razon }] of Object.entries(RUTAS_DECLARADAS)) {
    assert.equal(
      classifyPath(pathname),
      acceso,
      `${pathname} está declarada como ${acceso} (${razon}), pero el perímetro la clasifica distinto.`,
    );
  }
});

test("toda ruta privada resuelve la identidad de su clase en su propio archivo", () => {
  for (const { pathname, archivo } of RUTAS_EN_DISCO) {
    const acceso = RUTAS_DECLARADAS[pathname]?.acceso;
    if (acceso === "PUBLICA") continue;

    const fuente = readFileSync(archivo, "utf8");
    const simbolos = acceso === "PORTAL" ? SIMBOLOS_DE_PORTAL : SIMBOLOS_DE_IDENTIDAD;
    const resuelve = simbolos.some((s) => fuente.includes(s));

    assert.ok(
      resuelve,
      `${pathname} es de clase ${acceso} pero su archivo no resuelve esa identidad. ` +
        "El proxy solo comprueba que la cookie está presente; la validez la " +
        "decide la lectura de sesión o de acceso, y tiene que invocarse aquí.",
    );
  }
});

test("el portal no abre nada fuera de su prefijo, y solo su entrada es pública", () => {
  assert.equal(classifyPath("/portal"), "PORTAL");
  assert.equal(classifyPath("/portal/tickets/x"), "PORTAL");
  assert.equal(classifyPath("/portal/ingreso"), "PUBLICA");
  assert.equal(classifyPath("/portal/ingreso/codigo"), "PUBLICA");
  assert.equal(classifyPath("/portal/activar/abc"), "PUBLICA");
  // Prefijos parecidos no heredan ninguna de las dos clases.
  assert.equal(classifyPath("/portalfalso"), "EMPLEADO");
  assert.equal(classifyPath("/portal/ingresofalso"), "PORTAL");
  assert.equal(classifyPath("/tickets"), "EMPLEADO");
});

test("toda Server Action exportada resuelve identidad por su cuenta", () => {
  const SRC_DIR = path.resolve(THIS_DIR, "../..");
  const archivos = recorrerServerActions(SRC_DIR);

  // Si el recorrido dejara de encontrar archivos, la prueba pasaría sin
  // comprobar nada y nadie se enteraría.
  assert.ok(archivos.length > 0, "No se encontró ninguna Server Action");

  const anonimasEncontradas: string[] = [];
  for (const archivo of archivos) {
    const relativo = path.relative(SRC_DIR, archivo).split(path.sep).join("/");
    if (relativo in ACCIONES_ANONIMAS) {
      anonimasEncontradas.push(relativo);
      continue;
    }
    const fuente = readFileSync(archivo, "utf8");
    assert.ok(
      [...SIMBOLOS_DE_IDENTIDAD, ...SIMBOLOS_DE_PORTAL].some((s) => fuente.includes(s)),
      `Las Server Actions de ${relativo} no resuelven ` +
        "identidad. Una acción exportada es un endpoint alcanzable por sí " +
        "mismo: no hereda el guard de la página que la dibuja.",
    );
  }
  // Una excepción declarada que ya no existe es una excepción que nadie revisa.
  assert.deepEqual(anonimasEncontradas.sort(), Object.keys(ACCIONES_ANONIMAS).sort());
});

test("la clave compartida no sobrevive en ninguna parte del código", () => {
  const SRC_DIR = path.resolve(THIS_DIR, "../..");
  const pendientes = [SRC_DIR];
  const infractores: string[] = [];

  while (pendientes.length > 0) {
    const dir = pendientes.pop()!;
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      // `generated/` es salida de Prisma, no código escrito a mano.
      if (entrada.isDirectory()) {
        if (entrada.name !== "generated") pendientes.push(completo);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entrada.name)) continue;
      if (completo === fileURLToPath(import.meta.url)) continue;

      const fuente = readFileSync(completo, "utf8");
      // El nombre partido a propósito: si se escribiera entero, esta misma
      // prueba sería el resultado que busca.
      if (fuente.includes("REDIRECCION" + "_PASSWORD")) {
        infractores.push(path.relative(SRC_DIR, completo));
      }
    }
  }

  assert.deepEqual(
    infractores,
    [],
    `La clave compartida reaparece en: ${infractores.join(", ")}.`,
  );
});

test("normalizeAppPathname clasifica igual venga o no el prefijo de despliegue", () => {
  assert.equal(normalizeAppPathname("/helpdesk/login"), "/login");
  assert.equal(normalizeAppPathname("/login"), "/login");
  assert.equal(normalizeAppPathname("/helpdesk"), "/");
  assert.equal(normalizeAppPathname("/"), "/");
});

test("un prefijo público no abre las rutas que empiezan igual", () => {
  // Sin la barra final en la comparación, "/loginfalso" pasaría por pública.
  assert.equal(isPublicPath("/loginfalso"), false);
  assert.equal(isPublicPath("/api/auth/microsoft-falso"), false);
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api/auth/microsoft/start"), true);
  // La ruta del escalamiento es pública sola: ni su prefijo ni sus vecinas.
  assert.equal(isPublicPath("/api/interno/avisos/escalar"), true);
  assert.equal(isPublicPath("/api/interno/avisos"), false);
  assert.equal(isPublicPath("/api/interno"), false);
  assert.equal(isPublicPath("/api/avisos"), false);
});

test("la ruta pública del escalamiento exige su secreto antes de hacer nada", () => {
  const fuente = readFileSync(path.join(APP_DIR, "api/interno/avisos/escalar/route.ts"), "utf8");
  const exigeSecreto = fuente.indexOf("secretMatches(");
  const escala = fuente.indexOf("escalatePendingNotices()");
  assert.ok(exigeSecreto > 0, "La ruta no compara el secreto de cabecera.");
  assert.ok(escala > exigeSecreto, "La ruta escala antes de comprobar el secreto.");
  assert.ok(fuente.includes("HELPDESK_ESCALAR_AVISOS_SECRET"), "La ruta no lee su secreto.");
});

test("las rutas retiradas en U4 no vuelven por la lista pública", () => {
  // `/portal` y su API no se declararon públicas: se retiraron. Si alguien
  // las reintroduce, la primera prueba lo obliga a clasificarlas; esta impide
  // que la clasificación sea "pública" sin decidir antes el acceso externo
  // con identidad propia (specs/acceso-clientes.md).
  assert.equal(isPublicPath("/portal"), false);
  assert.equal(isPublicPath("/api/portal/clientes"), false);
  assert.equal(isPublicPath("/redireccion/login"), false);
});

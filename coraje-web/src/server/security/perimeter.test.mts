import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isPublicPath, normalizeAppPathname } from "./public-paths";

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
 * `publica: true` debe corresponder, una a una, con lo que
 * `PUBLIC_PATHS` deja pasar. Si alguien abre una ruta en el perímetro y se
 * olvida de esta tabla —o al revés— la prueba lo dice.
 */
const RUTAS_DECLARADAS: Record<string, { publica: boolean; razon: string }> = {
  "/": {
    publica: false,
    razon: "Entrada de empleados: sin sesión dispara el ingreso silencioso",
  },
  "/login": {
    publica: true,
    razon: "La puerta. Se dibuja sin sesión por definición",
  },
  "/redireccion": {
    publica: false,
    razon: "Bandeja interna de tickets por clasificar",
  },
  "/redireccion/[id]": {
    publica: false,
    razon: "Ficha interna: escribe área destino y encola el envío a SharePoint",
  },
  "/api/auth/logout": {
    publica: false,
    razon: "Revoca la sesión de quien la trae; sin cookie no hay nada que hacer",
  },
  "/api/auth/microsoft/start": {
    publica: true,
    razon: "Inicia el flujo OIDC: quien la pide todavía no tiene sesión",
  },
  "/api/auth/microsoft/callback": {
    publica: true,
    razon: "Vuelta del proveedor, con el código que producirá la sesión",
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
    .filter((s) => s !== "." && !(s.startsWith("(") && s.endsWith(")")));
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

function recorrerServerActions(dir: string, base = ""): ArchivoDeRuta[] {
  const encontradas: ArchivoDeRuta[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const relativo = path.join(base, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(
        ...recorrerServerActions(path.join(dir, entrada.name), relativo),
      );
      continue;
    }
    if (entrada.name === "actions.ts") {
      encontradas.push({
        pathname: pathnameDesdeArchivo(relativo),
        archivo: path.join(dir, entrada.name),
      });
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
  for (const [pathname, { publica, razon }] of Object.entries(RUTAS_DECLARADAS)) {
    assert.equal(
      isPublicPath(pathname),
      publica,
      `${pathname} está declarada como ${publica ? "pública" : "privada"} (${razon}), ` +
        "pero el perímetro la clasifica al revés.",
    );
  }
});

test("toda ruta privada resuelve identidad en su propio archivo", () => {
  for (const { pathname, archivo } of RUTAS_EN_DISCO) {
    if (RUTAS_DECLARADAS[pathname]?.publica) continue;

    const fuente = readFileSync(archivo, "utf8");
    const resuelve = SIMBOLOS_DE_IDENTIDAD.some((s) => fuente.includes(s));

    assert.ok(
      resuelve,
      `${pathname} es privada pero su archivo no resuelve identidad. ` +
        "El proxy solo comprueba que la cookie está presente; la validez la " +
        "decide la lectura de sesión, y tiene que invocarse aquí.",
    );
  }
});

test("toda Server Action exportada resuelve identidad por su cuenta", () => {
  for (const { pathname, archivo } of recorrerServerActions(APP_DIR)) {
    const fuente = readFileSync(archivo, "utf8");
    if (!fuente.includes('"use server"')) continue;

    assert.ok(
      SIMBOLOS_DE_IDENTIDAD.some((s) => fuente.includes(s)),
      `Las Server Actions de ${pathname} no resuelven identidad. Una acción ` +
        "exportada es un endpoint alcanzable por sí mismo: no hereda el guard " +
        "de la página que la dibuja.",
    );
  }
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

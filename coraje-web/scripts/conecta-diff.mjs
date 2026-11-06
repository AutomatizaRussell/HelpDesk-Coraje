#!/usr/bin/env node
/**
 * `pnpm conecta:diff` — qué cambió en el shell de Conecta desde la última copia.
 *
 * HelpDesk replica a mano el sidebar de Conecta (`patterns/conecta-shell/`) y
 * nada avisa cuando Conecta lo cambia (specs/integracion-conecta.md §6.1).
 * `conecta-upstream.json` fija el commit de RBGCT-REACT del que salió la copia
 * y los archivos de los que depende; este script trae el `main` de Conecta y
 * muestra el diff de esos archivos desde ese commit. Con el diff delante, se
 * porta el cambio y se sube el commit de la referencia **en el mismo commit**.
 *
 * Trabaja sobre la copia local de RBGCT-REACT, sin token: solo `git fetch`
 * y lecturas, lo único que la regla de Conecta permite sin preguntar
 * (CLAUDE.md, «Conecta — solo lectura»). No hace checkout ni toca su rama.
 *
 * Uso:
 *   pnpm conecta:diff            resumen (commits y archivos cambiados)
 *   pnpm conecta:diff --full     además, el diff completo
 *
 * `CONECTA_REPO_DIR` cambia la ubicación de la copia local; por defecto,
 * `RBGCT-REACT` junto a la carpeta del repositorio de HelpDesk.
 *
 * Sale con código 1 si hay cambios, para poder usarlo como comprobación.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const referencePath = resolve(here, "../src/design-system/patterns/conecta-shell/conecta-upstream.json");
const reference = JSON.parse(readFileSync(referencePath, "utf8"));
const repoDir = process.env.CONECTA_REPO_DIR ?? resolve(here, "../../../RBGCT-REACT");
const full = process.argv.includes("--full");

if (!existsSync(resolve(repoDir, ".git"))) {
  console.error(`No se encontró la copia local de RBGCT-REACT en ${repoDir}. Indícala con CONECTA_REPO_DIR.`);
  process.exit(2);
}

const git = (...args) => execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

git("fetch", "--quiet", "origin", reference.branch);
const upstream = `origin/${reference.branch}`;
const head = git("rev-parse", upstream).trim();
const range = `${reference.commit}..${upstream}`;

console.log(`Referencia: ${reference.commit.slice(0, 7)} (copiada el ${reference.copiedOn})`);
console.log(`${upstream}: ${head.slice(0, 7)}`);

const stat = git("diff", "--stat", reference.commit, upstream, "--", ...reference.files).trim();
if (!stat) {
  console.log("Sin cambios en los archivos del shell. La réplica está al día.");
  process.exit(0);
}

console.log("\nCommits que tocan el shell:");
console.log(git("log", "--oneline", "--no-merges", range, "--", ...reference.files).trim());
console.log("\nArchivos:");
console.log(stat);
if (full) {
  console.log("\n" + git("diff", reference.commit, upstream, "--", ...reference.files));
} else {
  console.log("\nDiff completo: pnpm conecta:diff --full");
}
console.log(`\nAl portar, actualiza "commit" en conecta-upstream.json a ${head}.`);
process.exit(1);

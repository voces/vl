// LSP-on-wasm step 3-C Stage 2: project-wide UNUSED-EXPORT hints off the
// SELF-HOSTED checker. `wasmChecker.moduleSurface` drives the seed's
// import/export pass (entry exports + resolved imports), and
// `buildUnusedExportUseMap`/`unusedExportHints` classify each export as
// dead / redundant / real off that surface + the native reference set —
// the native counterpart of the host's TS symbol scan. These tests load the
// real seed (`build/vl-compiler.wasm`); absent (fresh clone, no
// `refresh-compiler.sh` yet) they self-ignore, the same convention as the
// rest of the wasm suite.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  buildUnusedExportUseMap,
  unusedExportHints,
} from "../lsp/src/moduleGraph.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const logs: string[] = [];
const log = (m: string) => logs.push(m);

// A single-file surface: `used` is exported AND called locally (via `helper`'s
// caller), `dead` is exported and never referenced. No imports, no siblings.
const single = "export function used(): i32 {\n" +
  "  helper()\n" +
  "}\n" +
  "function helper(): i32 {\n" +
  "  1\n" +
  "}\n" +
  "export let dead = 5\n";

Deno.test({
  name: "wasm-unused-export: moduleSurface reports a file's exports",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const surface = checker.moduleSurface(single, "/proj/main.vl");
  const names = surface.exports.map((e) => e.name).sort();
  if (names.length !== 2 || names[0] !== "dead" || names[1] !== "used") {
    throw new Error(`expected exports [dead, used], got ${JSON.stringify(names)}`);
  }
  const used = surface.exports.find((e) => e.name === "used")!;
  // `used`'s decl name is on line 1 (1-based), after `export function ` (16 cols);
  // the `export` keyword is at the line start (col 0).
  if (used.declLine !== 1) {
    throw new Error(`expected used.declLine 1, got ${used.declLine}`);
  }
  if (used.declCol !== 16) {
    throw new Error(`expected used.declCol 16, got ${used.declCol}`);
  }
  if (used.kwLine !== 1 || used.kwCol !== 0) {
    throw new Error(
      `expected used keyword at 1:0, got ${used.kwLine}:${used.kwCol}`,
    );
  }
  const dead = surface.exports.find((e) => e.name === "dead")!;
  if (dead.declLine !== 7) {
    throw new Error(`expected dead.declLine 7, got ${dead.declLine}`);
  }
});

// Two in-memory modules: `util` exports `add` (imported by `main`) and `unused`
// (imported by no one). `main` imports only `add`. So across the project:
//   add    → cross > 0           → real export, no hint
//   unused → cross == 0, local 0 → dead, hint on the NAME
const util = "export function add(a: i32, b: i32): i32 {\n" +
  "  a + b\n" +
  "}\n" +
  "export function unused(): i32 {\n" +
  "  1\n" +
  "}\n";
const main = 'import { add } from "./util"\nprint(add(1, 2))\n';
const utilKey = "/proj/util.vl";
const mainKey = "/proj/main.vl";
const read = (key: string): string | undefined => {
  if (key === utilKey || key.endsWith("util.vl")) return util;
  if (key === mainKey || key.endsWith("main.vl")) return main;
  return undefined;
};

Deno.test({
  name: "wasm-unused-export: cross-module use exempts an export, dead one is hinted",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const useMap = await buildUnusedExportUseMap([utilKey, mainKey], read, checker);

  const utilCounts = useMap.get(utilKey);
  if (utilCounts === undefined) {
    throw new Error("expected util.vl to be seeded in the use-map");
  }
  const add = utilCounts.get("add");
  const unused = utilCounts.get("unused");
  if (add === undefined || unused === undefined) {
    throw new Error(
      `expected both util exports seeded, got ${JSON.stringify([...utilCounts])}`,
    );
  }
  if (add.cross < 1) {
    throw new Error(`expected add.cross >= 1, got ${add.cross}`);
  }
  if (unused.cross !== 0 || unused.local !== 0) {
    throw new Error(
      `expected unused {0,0}, got {${unused.cross},${unused.local}}`,
    );
  }

  const hints = unusedExportHints(util, utilKey, useMap, checker);
  // `add` is imported cross-module → no hint; `unused` is dead → one hint.
  if (hints.length !== 1) {
    throw new Error(`expected exactly one hint, got ${JSON.stringify(hints)}`);
  }
  const hint = hints[0];
  if (hint.code !== "unused-export") {
    throw new Error(`expected unused-export code, got ${hint.code}`);
  }
  if (!hint.message.includes("unused")) {
    throw new Error(`expected message to name \`unused\`, got ${hint.message}`);
  }
  if (hint.severity !== "hint") {
    throw new Error(`expected hint severity, got ${hint.severity}`);
  }
});

// `localOnly` is exported AND used within its own module (a local helper calls
// it), but imported by no other module: cross == 0, local > 0 → the `export`
// keyword is redundant, hinted on the KEYWORD (not the name).
const localUse = "export function localOnly(): i32 {\n" +
  "  99\n" +
  "}\n" +
  "function helper(): i32 {\n" +
  "  localOnly()\n" +
  "}\n";
const localKey = "/proj/local.vl";
const readLocal = (key: string): string | undefined =>
  key === localKey || key.endsWith("local.vl") ? localUse : undefined;

Deno.test({
  name: "wasm-unused-export: a locally-used-but-unimported export hints the `export` keyword",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const useMap = await buildUnusedExportUseMap([localKey], readLocal, checker);
  const counts = useMap.get(localKey)?.get("localOnly");
  if (counts === undefined) throw new Error("expected localOnly seeded");
  if (counts.cross !== 0 || counts.local < 1) {
    throw new Error(`expected {0,>=1}, got {${counts.cross},${counts.local}}`);
  }
  const hints = unusedExportHints(localUse, localKey, useMap, checker);
  if (hints.length !== 1) {
    throw new Error(`expected one hint, got ${JSON.stringify(hints)}`);
  }
  if (hints[0].code !== "redundant-export") {
    throw new Error(`expected redundant-export, got ${hints[0].code}`);
  }
  // The hint targets the `export` keyword at the start of line 1, not the name.
  if (hints[0].range.start.line !== 0 || hints[0].range.start.character !== 0) {
    throw new Error(
      `expected keyword range at 0:0, got ${JSON.stringify(hints[0].range.start)}`,
    );
  }
});

Deno.test({
  name: "wasm-unused-export: a file with no exports yields no use-map entry and no hints",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "function f(): i32 {\n  1\n}\nprint(f())\n";
  const key = "/proj/noexport.vl";
  const readNone = (k: string): string | undefined => k === key ? src : undefined;
  const useMap = await buildUnusedExportUseMap([key], readNone, checker);
  if (useMap.get(key) !== undefined) {
    throw new Error("expected no use-map entry for an export-free file");
  }
  const hints = unusedExportHints(src, key, useMap, checker);
  if (hints.length !== 0) {
    throw new Error(`expected no hints, got ${JSON.stringify(hints)}`);
  }
});

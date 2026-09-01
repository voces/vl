// D9.4 code lens (export reference counts): one "N refs" lens per export
// declaration, read from the use-map the unused-export workspace pass already
// maintains — `exportRefLenses` (typeFeatures.ts) shapes `moduleSurface`
// exports + the map into lenses, `refCountLensTitle` spells the title. The
// seed-backed test drives the REAL pipeline: `buildUnusedExportUseMap` over a
// two-module project, then lenses for the exporting file. Loads the real seed
// (`build/vl-compiler.wasm`); absent it self-ignores, the same convention as
// the rest of the wasm suite.

import {
  exportRefLenses,
  refCountLensTitle,
} from "../lsp/src/typeFeatures.ts";
import { buildUnusedExportUseMap } from "../lsp/src/moduleGraph.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

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
const log = (_m: string) => {};

// ---- pure shaping -----------------------------------------------------------

const decl = (name: string, declLine: number, declCol: number) => ({
  name,
  declLine,
  declCol,
});

Deno.test("code-lens: counts sum cross + local, positions map native to LSP", () => {
  const counts = new Map([
    ["add", { cross: 2, local: 1 }],
    ["dead", { cross: 0, local: 0 }],
  ]);
  const lenses = exportRefLenses([decl("add", 1, 16), decl("dead", 4, 11)], counts);
  if (lenses.length !== 2) {
    throw new Error(`want 2 lenses, got ${JSON.stringify(lenses)}`);
  }
  const add = lenses[0];
  if (add.count !== 3) throw new Error(`want add count 3, got ${add.count}`);
  // Native 1-based declLine 1 → LSP line 0; col passes through.
  if (add.line !== 0 || add.char !== 16 || add.length !== 3) {
    throw new Error(`want add at 0:16 len 3, got ${JSON.stringify(add)}`);
  }
  if (lenses[1].count !== 0) {
    throw new Error(`want dead count 0, got ${lenses[1].count}`);
  }
});

Deno.test("code-lens: no use-map yet means no lenses, not invented zeros", () => {
  if (exportRefLenses([decl("f", 1, 0)], undefined).length !== 0) {
    throw new Error("want no lenses before the first workspace pass");
  }
});

Deno.test("code-lens: an export the pass has not seen yet is skipped", () => {
  const counts = new Map([["old", { cross: 1, local: 0 }]]);
  const lenses = exportRefLenses(
    [decl("old", 1, 0), decl("brandNew", 2, 0)],
    counts,
  );
  if (lenses.length !== 1 || lenses[0].name !== "old") {
    throw new Error(`want only the mapped export, got ${JSON.stringify(lenses)}`);
  }
});

Deno.test("code-lens: duplicate export names collapse to the first decl", () => {
  const counts = new Map([["twice", { cross: 1, local: 1 }]]);
  const lenses = exportRefLenses(
    [decl("twice", 1, 7), decl("twice", 5, 7)],
    counts,
  );
  if (lenses.length !== 1 || lenses[0].line !== 0) {
    throw new Error(`want one lens at the first decl, got ${JSON.stringify(lenses)}`);
  }
});

Deno.test("code-lens: the title pluralizes", () => {
  const got = [refCountLensTitle(0), refCountLensTitle(1), refCountLensTitle(2)];
  if (JSON.stringify(got) !== JSON.stringify(["0 refs", "1 ref", "2 refs"])) {
    throw new Error(`want [0 refs, 1 ref, 2 refs], got ${JSON.stringify(got)}`);
  }
});

// ---- seed-backed: the real use-map feeding real lenses ----------------------

// `add` is imported by main (cross 1) and used once inside util itself via
// `double` (local 1) → "2 refs"; `unused` is referenced nowhere → "0 refs".
const util = "export function add(a: i32, b: i32): i32 {\n" +
  "  a + b\n" +
  "}\n" +
  "export function unused(): i32 {\n" +
  "  1\n" +
  "}\n" +
  "function double(n: i32): i32 {\n" +
  "  add(n, n)\n" +
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
  name: "code-lens(wasm): export counts off the real use-map and surface",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const useMap = await buildUnusedExportUseMap([utilKey, mainKey], read, checker);
  const surface = checker.moduleSurface(util, utilKey);
  const lenses = exportRefLenses(surface.exports, useMap.get(utilKey));
  if (lenses.length !== 2) {
    throw new Error(`want lenses for add + unused, got ${JSON.stringify(lenses)}`);
  }
  const add = lenses.find((l) => l.name === "add")!;
  if (add.count !== 2) {
    throw new Error(`want add "2 refs" (1 cross + 1 local), got ${add.count}`);
  }
  if (add.line !== 0 || add.char !== 16) {
    throw new Error(`want the add lens anchored at 0:16, got ${add.line}:${add.char}`);
  }
  const unused = lenses.find((l) => l.name === "unused")!;
  if (unused.count !== 0) {
    throw new Error(`want unused "0 refs", got ${unused.count}`);
  }
  if (refCountLensTitle(add.count) !== "2 refs") {
    throw new Error(`want "2 refs", got ${refCountLensTitle(add.count)}`);
  }
});

Deno.test({
  name: "code-lens(wasm): a file the pass never covered gets no lenses",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const useMap = await buildUnusedExportUseMap([mainKey], read, checker);
  const surface = checker.moduleSurface(util, utilKey);
  const lenses = exportRefLenses(surface.exports, useMap.get(utilKey));
  if (lenses.length !== 0) {
    throw new Error(`want no lenses without util in the map, got ${JSON.stringify(lenses)}`);
  }
});

// Receiver overloading (owner ruling O1, docs/internals/receiver-overloading.md) in
// the editor: two modules each export a `self`-function `describe`, and a method call
// picks one by its receiver's type. Go-to-definition, find-references, rename and
// hover must follow the checker's per-call-site pick, never a table keyed by the
// spelling, where the second import overwrites the first. A single-candidate control
// pins the ordinary case. The tests load the real seed (`build/vl-compiler.wasm`);
// absent, they self-ignore like the rest of the wasm suite.

import { filePath } from "./support/filePath.ts";
import type { ModuleReader } from "../compiler/coreTypes.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { pathToUri } from "../lsp/src/moduleGraph.ts";
import {
  definitionAt,
  type FeatureContext,
  type FeatureWorkspace,
  hoverAt,
  referencesAt,
  renameAt,
} from "../lsp/src/features.ts";
import { seedPresent } from "./support/tree.ts";

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
const ignore = !seedPresent(SEED);
const checker = ignore ? undefined : loadWasmChecker(SEED, () => {});

const A_SRC = 'export type A = { x: i32 }\nexport function describe(self: A): string {\n  return "A"\n}\n';
const B_SRC = 'export type B = { y: string }\nexport function describe(self: B): string {\n  return "B"\n}\n';
// Line 4 calls A's candidate, line 5 B's; `describe` starts at column 8 on both.
const MAIN_SRC = 'import { A, describe } from "./a"\nimport { B, describe } from "./b"\n' +
  'const p: A = { x: 1 }\nconst q: B = { y: "s" }\nprint(p.describe())\nprint(q.describe())\n';

const files: Record<string, string> = {
  "/proj/a.vl": A_SRC,
  "/proj/b.vl": B_SRC,
  "/proj/main.vl": MAIN_SRC,
};
const read: ModuleReader = (key: string) => files[key];

const ctxFor = (entryKey: string): FeatureContext => ({
  checker: checker!,
  entryKey,
  reader: read,
  log: () => {},
});
const workspaceFor = (entryKey: string, keys: string[]): FeatureWorkspace => ({
  uri: pathToUri(entryKey),
  openDocs: () => keys.map((k) => ({ uri: pathToUri(k), text: files[k] })),
  diskFiles: () => [],
});

const want = (what: string, wanted: unknown, got: unknown): void => {
  const w = JSON.stringify(wanted);
  const g = JSON.stringify(got);
  if (w !== g) throw new Error(`${what}: want ${w}, got ${g}`);
};

// `describe`'s declaration name in either module: line 1 (0-based), columns 16..24.
const DECL = { start: { line: 1, character: 16 }, end: { line: 1, character: 24 } };

Deno.test({
  name: "receiver overload: go-to-definition on each method call picks its receiver's module",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/main.vl");
  want("p.describe()", { key: "/proj/a.vl", range: DECL }, await definitionAt(MAIN_SRC, { line: 4, character: 9 }, ctx));
  want("q.describe()", { key: "/proj/b.vl", range: DECL }, await definitionAt(MAIN_SRC, { line: 5, character: 9 }, ctx));
});

Deno.test({
  name: "receiver overload: find-references on a method call names only its candidate's uses",
  ignore,
}, async () => {
  // An imported binding's references are the importer's own occurrences of it, so
  // each call finds itself and not the other candidate's call or declaration.
  const ctx = ctxFor("/proj/main.vl");
  const ws = workspaceFor("/proj/main.vl", ["/proj/a.vl", "/proj/b.vl", "/proj/main.vl"]);
  const pick = async (line: number) =>
    ((await referencesAt(MAIN_SRC, { line, character: 9 }, true, ctx, ws)) ?? [])
      .map((r) => `${r.uri}@${r.range.start.line}:${r.range.start.character}`)
      .sort();
  const main = pathToUri("/proj/main.vl");
  want("refs from p.describe()", [`${main}@4:8`], await pick(4));
  want("refs from q.describe()", [`${main}@5:8`], await pick(5));
});

Deno.test({
  name: "receiver overload: rename at a method call renames only the picked candidate",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/main.vl");
  const ws = workspaceFor("/proj/main.vl", ["/proj/a.vl", "/proj/b.vl", "/proj/main.vl"]);
  const edit = await renameAt(MAIN_SRC, { line: 4, character: 9 }, "explain", ctx, ws, () => false);
  if (edit === null || "error" in edit) throw new Error(`want edits, got ${JSON.stringify(edit)}`);
  const spans = (key: string) =>
    (edit.changes[pathToUri(key)] ?? [])
      .map((e) => `${e.range.start.line}:${e.range.start.character}-${e.range.end.character}=${e.newText}`)
      .sort();
  want("a.vl edits", ["1:16-24=explain"], spans("/proj/a.vl"));
  want("b.vl edits", [], spans("/proj/b.vl"));
  // The `describe` of the `./a` specifier and A's call; B's specifier and call stay.
  want("main.vl edits", ["0:12-20=explain", "4:8-16=explain"], spans("/proj/main.vl"));
});

Deno.test({
  name: "receiver overload: hover on each method call shows its candidate's signature",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/main.vl");
  const p = await hoverAt(MAIN_SRC, { line: 4, character: 9 }, ctx);
  const q = await hoverAt(MAIN_SRC, { line: 5, character: 9 }, ctx);
  if (!p?.includes("describe: (self: A) => string")) throw new Error(`p hover: want A's signature, got ${JSON.stringify(p)}`);
  if (!q?.includes("describe: (self: B) => string")) throw new Error(`q hover: want B's signature, got ${JSON.stringify(q)}`);
});

// The control: one module, one `self`-function, one import.
const ONE_SRC = "export type C = { n: i32 }\nexport function size(self: C): i32 {\n  return self.n\n}\n";
const ONE_MAIN = 'import { C, size } from "./one"\nconst c: C = { n: 3 }\nprint(c.size())\nprint(size(c))\n';
files["/proj/one.vl"] = ONE_SRC;
files["/proj/one_main.vl"] = ONE_MAIN;

Deno.test({
  name: "receiver overload control: a lone self-function's plain call keeps its definition, references and hover",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/one_main.vl");
  const declRange = { start: { line: 1, character: 16 }, end: { line: 1, character: 20 } };
  const decl = { key: "/proj/one.vl", range: declRange };
  want("c.size() definition", decl, await definitionAt(ONE_MAIN, { line: 2, character: 9 }, ctx));
  want("size(c) definition", decl, await definitionAt(ONE_MAIN, { line: 3, character: 7 }, ctx));
  const ws = workspaceFor("/proj/one_main.vl", ["/proj/one.vl", "/proj/one_main.vl"]);
  const refs = ((await referencesAt(ONE_MAIN, { line: 3, character: 7 }, true, ctx, ws)) ?? [])
    .map((r) => `${r.uri}@${r.range.start.line}:${r.range.start.character}`);
  // The method-call spelling on line 2 is a use of the same binding.
  const main = pathToUri("/proj/one_main.vl");
  if (!refs.includes(`${main}@3:6`)) throw new Error(`size refs: want ${main}@3:6 among ${JSON.stringify(refs)}`);
  const h = await hoverAt(ONE_MAIN, { line: 3, character: 7 }, ctx);
  if (!h?.includes("size: (self: C) => i32")) throw new Error(`size hover: want its signature, got ${JSON.stringify(h)}`);
});

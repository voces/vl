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
  documentSymbolsAt,
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

// One module declares both candidates (the intra-module extension of O1). The declarations
// sit on lines 2 and 3, `tag` at columns 9..12; the entry's calls on lines 6 and 7.
const SET_SRC = "type K = { k: i32 }\ntype L = { l: string }\n" +
  'function tag(self: K): string { return "K" }\nfunction tag(self: L): string { return "L" }\n' +
  'const k: K = { k: 1 }\nconst l: L = { l: "s" }\nprint(k.tag())\nprint(l.tag())\n';
files["/proj/set.vl"] = SET_SRC;
const tagDecl = (line: number) => ({ start: { line, character: 9 }, end: { line, character: 12 } });

Deno.test({
  name: "receiver overload, one module: go-to-definition picks each call's candidate",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/set.vl");
  // A same-file definition carries no module key.
  want("k.tag()", { range: tagDecl(2) }, await definitionAt(SET_SRC, { line: 6, character: 9 }, ctx));
  want("l.tag()", { range: tagDecl(3) }, await definitionAt(SET_SRC, { line: 7, character: 9 }, ctx));
});

Deno.test({
  name: "receiver overload, one module: find-references names one candidate's declaration and call",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/set.vl");
  const ws = workspaceFor("/proj/set.vl", ["/proj/set.vl"]);
  const pick = async (line: number) =>
    ((await referencesAt(SET_SRC, { line, character: 9 }, true, ctx, ws)) ?? [])
      .map((r) => `${r.range.start.line}:${r.range.start.character}`)
      .sort();
  want("refs from k.tag()", ["2:9", "6:8"], await pick(6));
  want("refs from l.tag()", ["3:9", "7:8"], await pick(7));
});

Deno.test({
  name: "receiver overload, one module: hover shows the plain name and the candidate's signature",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/set.vl");
  const k = await hoverAt(SET_SRC, { line: 6, character: 9 }, ctx);
  const l = await hoverAt(SET_SRC, { line: 7, character: 9 }, ctx);
  if (!k?.includes("tag: (self: K) => string")) throw new Error(`k hover: want K's signature, got ${JSON.stringify(k)}`);
  if (!l?.includes("tag: (self: L) => string")) throw new Error(`l hover: want L's signature, got ${JSON.stringify(l)}`);
});

Deno.test({
  name: "receiver overload, one module: the outline names each candidate by its plain name",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/set.vl");
  const names = ((await documentSymbolsAt(SET_SRC, ctx)) ?? []).map((s) => s.name);
  want("outline", ["K", "L", "tag", "tag", "k", "l"], names);
});

// An importer of a set one module declares: `import { tag }` binds every candidate.
const SETLIB_SRC = 'export type K = { k: i32 }\nexport type L = { l: string }\n' +
  'export function tag(self: K): string { return "K" }\nexport function tag(self: L): string { return "L" }\n';
const SETMAIN_SRC = 'import { K, L, tag } from "./setlib"\nconst k: K = { k: 1 }\nconst l: L = { l: "s" }\n' +
  "print(k.tag())\nprint(l.tag())\n";
files["/proj/setlib.vl"] = SETLIB_SRC;
files["/proj/setmain.vl"] = SETMAIN_SRC;

Deno.test({
  name: "receiver overload, one module imported: go-to-definition and hover pick each call's candidate",
  ignore,
}, async () => {
  const ctx = ctxFor("/proj/setmain.vl");
  want("k.tag()", { key: "/proj/setlib.vl", range: { start: { line: 2, character: 16 }, end: { line: 2, character: 19 } } }, await definitionAt(SETMAIN_SRC, { line: 3, character: 9 }, ctx));
  want("l.tag()", { key: "/proj/setlib.vl", range: { start: { line: 3, character: 16 }, end: { line: 3, character: 19 } } }, await definitionAt(SETMAIN_SRC, { line: 4, character: 9 }, ctx));
  const l = await hoverAt(SETMAIN_SRC, { line: 4, character: 9 }, ctx);
  if (!l?.includes("tag: (self: L) => string")) throw new Error(`l hover: want L's signature, got ${JSON.stringify(l)}`);
});

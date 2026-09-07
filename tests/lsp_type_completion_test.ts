// ROADMAP row 32, third surface — the `type` NAME completion SOURCE, and its `///`.
//
// A user `type` was offered as no completion item at all: `symScopeAt` records
// variable/parameter/function bindings, and a type is none of those. This is a missing
// SOURCE, not a doc gap — the doc then rides `docForDeclTok` like the other three surfaces.
//
// A type is not a value binding, so the visibility walk knows nothing about it and the TOKEN
// stream is where a type declaration is visible. Two consequences are asserted below rather
// than assumed: a type declared inside a BLOCK is not offered at all (rather than offered
// out of its block), and an IMPORTED type carries its `///` but no rendered body, because the
// merge renames the declaration and the checker has no entry under the local spelling.
//
// The multi-module case is not optional (D1863) — the doc table is filled by the lex and the
// module pipeline serves tokens from a cache, so single-file fixtures cannot see that class.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  type Completion,
  type ExtTypeName,
  typeCompletionsFromWasm,
} from "../lsp/src/typeFeatures.ts";
import { completion, initLsp } from "../playground/src/lspAdapter.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";

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
const noSiblings = () => undefined;

const LIB = [
  "/// A point from the library.",
  "export type LibPt = { lx: i32, ly: i32 }",
  "export function mk(): LibPt { return { lx: 1, ly: 2 } }",
  "",
].join("\n");
const libRead = (key: string): string | undefined =>
  key.endsWith("lib") || key.endsWith("lib.vl") ? LIB : undefined;

const typesAt = async (
  src: string,
  r: (k: string) => string | undefined,
  line: number,
): Promise<ExtTypeName[]> =>
  await loadWasmChecker(SEED, () => {})!.typeNamesAt(src, "/tmp/main.vl", r, line, 0);

const one = (ts: ExtTypeName[], name: string): ExtTypeName => {
  const t = ts.find((x) => x.name === name);
  if (t === undefined) throw new Error(`no type named ${name} in ${JSON.stringify(ts)}`);
  return t;
};

// A struct type and an ALIAS of it: both offered, each with its OWN doc, and the alias
// renders the body it stands for.
const LOCAL = [
  /* 0 */ "/// A local point.",
  /* 1 */ "type Pt = { x: i32, y: i32 }",
  /* 2 */ "/// An alias of the local point.",
  /* 3 */ "type Alias = Pt",
  /* 4 */ "const p: Pt = { x: 1, y: 2 }",
  /* 5 */ "print(p.x)",
  /* 6 */ "",
].join("\n");

Deno.test({ name: "type completion: a struct type and an alias are both offered, each with its own doc", ignore }, async () => {
  const ts = await typesAt(LOCAL, noSiblings, 6);
  const pt = one(ts, "Pt");
  if (pt.detail !== "{x: i32, y: i32}") throw new Error(`Pt detail: ${JSON.stringify(pt.detail)}`);
  if (pt.doc !== "A local point.") throw new Error(`Pt doc: ${JSON.stringify(pt.doc)}`);
  const al = one(ts, "Alias");
  if (al.detail !== "{x: i32, y: i32}") throw new Error(`Alias detail: ${JSON.stringify(al.detail)}`);
  if (al.doc !== "An alias of the local point.") {
    throw new Error(`Alias doc: ${JSON.stringify(al.doc)}`);
  }
});

// An IMPORTED type is offered and carries its `///`; its rendered body is empty because the
// merge renames the declaration, so the checker has no entry under the local spelling. That
// is a measured limit, not a design choice, and the item shows its name and prose.
Deno.test({ name: "type completion: an imported type carries its doc and no rendered body", ignore }, async () => {
  const src = [
    'import { LibPt, mk } from "./lib"',
    "/// A local point.",
    "type Pt = { x: i32, y: i32 }",
    "const q: LibPt = mk()",
    "print(q.lx)",
    "",
  ].join("\n");
  const ts = await typesAt(src, libRead, 5);
  const lib = one(ts, "LibPt");
  if (lib.doc !== "A point from the library.") throw new Error(`LibPt doc: ${JSON.stringify(lib.doc)}`);
  if (lib.detail !== "") throw new Error(`LibPt detail should be empty: ${JSON.stringify(lib.detail)}`);
  // The file's OWN type is unaffected by the import.
  if (one(ts, "Pt").detail !== "{x: i32, y: i32}") throw new Error("the local type lost its body");
});

// A type declared inside a block is NOT offered — rather than offered outside the block it
// belongs to. The top-level sibling in the same program is the control.
Deno.test({ name: "type completion: a block-local type is not offered; its top-level sibling is", ignore }, async () => {
  const src = [
    "function f(): i32 {",
    "  type Inner = { a: i32 }",
    "  const p: Inner = { a: 1 }",
    "  return p.a",
    "}",
    "/// Top level.",
    "type Outer = { b: i32 }",
    "print(f())",
    "",
  ].join("\n");
  const ts = await typesAt(src, noSiblings, 8);
  if (ts.some((t) => t.name === "Inner")) throw new Error("a block-local type was offered");
  if (one(ts, "Outer").doc !== "Top level.") throw new Error("the top-level sibling was lost");
});

// ── the multi-module face (D1863) ────────────────────────────────────────────
// A FRESH checker per arm: one asked both would let the single-module arm's doc rows answer
// the multi-module arm's query.
Deno.test({ name: "type completion: an `import` does not silence the docs (D1863)", ignore }, async () => {
  const body = [
    "/// A local point.",
    "type Pt = { x: i32, y: i32 }",
    "const p: Pt = { x: 1, y: 2 }",
    "print(p.x)",
    "",
  ];
  const solo = ["", ...body].join("\n");
  const importing = ['import { mk } from "./lib"', ...body].join("\n");
  const docOf = async (src: string, r: (k: string) => string | undefined, line: number) =>
    one(await typesAt(src, r, line), "Pt").doc;
  const a = await docOf(solo, noSiblings, 5);
  const b = await docOf(importing, libRead, 5);
  if (a !== "A local point.") throw new Error(`the single-module control: ${JSON.stringify(a)}`);
  if (b !== a) throw new Error(`with an import ${JSON.stringify(b)} != without ${JSON.stringify(a)}`);
});

// ── the namespace rule ───────────────────────────────────────────────────────
// A type and a value can share a name. One label cannot mean both, and at a use site the
// value is what the author reaches for — so the value's item wins and the type is dropped,
// not added beside it.
Deno.test({ name: "type completion: a name that is both a value and a type yields ONE item", ignore }, async () => {
  const src = ["type Thing = { v: i32 }", "const Thing = 7", "print(Thing)", ""].join("\n");
  const ts = await typesAt(src, noSiblings, 3);
  if (!ts.some((t) => t.name === "Thing")) throw new Error("the query should still report it");
  // The host's rule: `taken` is the set of names a value already offered.
  const dropped = typeCompletionsFromWasm(ts, (n) => n === "Thing");
  if (dropped.some((c) => c.name === "Thing")) throw new Error("the type shadowed the value");
  const kept = typeCompletionsFromWasm(ts, () => false);
  if (kept.find((c) => c.name === "Thing")?.kind !== "type") {
    throw new Error("with no value of that name the type should be offered");
  }
});

Deno.test("type completion: typeCompletionsFromWasm de-dupes and drops an empty detail", () => {
  const cs: Completion[] = typeCompletionsFromWasm(
    [
      { name: "A", detail: "{v: i32}", doc: "Documented." },
      { name: "A", detail: "{v: i32}" },
      { name: "B", detail: "" },
    ],
    () => false,
  );
  if (cs.length !== 2) throw new Error(`want 2 items, got ${JSON.stringify(cs)}`);
  const a = cs.find((c) => c.name === "A")!;
  if (a.doc !== "Documented.") throw new Error("first-wins lost the documented one");
  if (cs.find((c) => c.name === "B")!.detail !== undefined) {
    throw new Error("an empty detail should be dropped, not shown as an empty block");
  }
});

// ── the playground, end to end ───────────────────────────────────────────────

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

Deno.test({ name: "type completion: the playground offers the type with its prose", ignore }, async () => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
  const cs = await completion(LOCAL, { line: 6, character: 0 });
  const pt = cs.find((c) => c.label === "Pt");
  if (pt === undefined) throw new Error("no `Pt` item");
  if (pt.kind !== "type") throw new Error(`Pt kind: ${pt.kind}`);
  if (pt.documentation === undefined || !pt.documentation.startsWith("A local point.\n")) {
    throw new Error(`Pt documentation: ${JSON.stringify(pt.documentation)}`);
  }
});

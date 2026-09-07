// D9.11, struct-FIELD half (ROADMAP row 32) — a field's `///` reaches the member-completion
// panel, through the same `docMarkdown` layout hover uses.
//
// This surface differs from the other three in a way worth stating: `scopeResTok` and
// `ufcTok` bank a DECLARATION node's name token, and a `TyObj` has none. It is
// `{objFieldNames, objFieldTypes}` — structural, with no back-link — so two identical
// `type`s share one arena entry and the receiver's declaration is recoverable only from the
// RECEIVER, which is in hand during the scan and not at read time. Banking is therefore not
// an optimisation over re-finding; re-finding is not available.
//
// The `n == 1` name guard in `memcTypeNameTok` is a FLOOR, not a live limit, and the case
// below is what measured it: two independently declared identical `type`s keep separate
// arena entries, so each receiver finds its own declaration, and an ALIAS resolves to the
// declaration that carries the doc. Only an anonymous receiver has no declaration to read.
//
// The multi-module case is not optional (D1863): the doc table is filled by the lex and the
// module pipeline serves tokens from a cache, so a suite of single-file fixtures cannot see
// a whole class of defect. Every new doc suite carries one from now on.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  type Completion,
  docMarkdown,
  memberCompletionsFromWasm,
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

// One fixture, every case. The cursor is the receiver `p` — the member scan takes the
// receiver's position with the `.` already absent, as `server.ts` hands it over.
const SRC = [
  /*  0 */ "type Pt = {",
  /*  1 */ "  /// The horizontal coordinate.",
  /*  2 */ "  /// The second line of the same block.",
  /*  3 */ "  x: i32,",
  /*  4 */ "  y: i32,",
  /*  5 */ "  // Not documentation: two slashes.",
  /*  6 */ "  ordinary: i32,",
  /*  7 */ "  /// Separated from the field by a blank line.",
  /*  8 */ "",
  /*  9 */ "  detached: i32,",
  /* 10 */ "}",
  /* 11 */ "const p: Pt = { x: 1, y: 2, ordinary: 3, detached: 4 }",
  /* 12 */ "print(p)",
  "",
].join("\n");
const RECV = { line: 12, character: 6 };

const members = async (src: string, line: number, ch: number): Promise<Completion[]> => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const ms = await checker.memberCompletionsAt(src, "/tmp/x.vl", noSiblings, line, ch);
  return memberCompletionsFromWasm(ms);
};

const docOf = (cs: Completion[], name: string): string | undefined => {
  const c = cs.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no member named ${name}`);
  return c.doc;
};

Deno.test({ name: "field docs: a documented field carries its block", ignore }, async () => {
  const want = "The horizontal coordinate.\nThe second line of the same block.";
  const got = docOf(await members(SRC, RECV.line, RECV.character), "x");
  if (got !== want) {
    throw new Error(`x: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
});

// The discriminators, in one test so a rule that started attaching the wrong thing cannot
// read as three unrelated failures.
Deno.test({ name: "field docs: undocumented, `//` and a blank line all carry NO doc", ignore }, async () => {
  const cs = await members(SRC, RECV.line, RECV.character);
  for (const name of ["y", "ordinary", "detached"]) {
    const got = docOf(cs, name);
    if (got !== undefined) {
      throw new Error(`${name}: want no doc, got ${JSON.stringify(got)}`);
    }
  }
});

Deno.test({ name: "field docs: a field's doc is byte-for-byte hover's", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const cs = await members(SRC, RECV.line, RECV.character);
  // (name, the line/col of that field's DECLARATION inside the `type` body).
  const decls: [string, number, number][] = [
    ["x", 3, 3],
    ["y", 4, 3],
    ["ordinary", 6, 4],
    ["detached", 9, 4],
  ];
  for (const [name, line, col] of decls) {
    const hover = await checker.docAt(SRC, "/tmp/x.vl", noSiblings, line, col);
    const item = docOf(cs, name);
    if (hover !== item) {
      throw new Error(
        `${name}: hover ${JSON.stringify(hover)} != member ${JSON.stringify(item)}`,
      );
    }
  }
});

// What the name guard actually does, measured rather than assumed. The first draft of this
// case asserted that two identical `type`s are ambiguous and offer nothing — the seed says
// otherwise, and the guard turns out to be a floor no named receiver reaches.
Deno.test({ name: "field docs: identical types, an alias, and an anonymous receiver", ignore }, async () => {
  // Two independently declared, structurally identical types: separate arena entries, so
  // each receiver finds its OWN declaration and B's undocumented field stays undocumented.
  const two = [
    "type A = {",
    "  /// Documented on A.",
    "  v: i32,",
    "}",
    "type B = {",
    "  v: i32,",
    "}",
    "const a: A = { v: 1 }",
    "const b: B = { v: 2 }",
    "print(a)",
    "print(b)",
    "",
  ].join("\n");
  const onA = docOf(await members(two, 9, 6), "v");
  if (onA !== "Documented on A.") throw new Error(`receiver A: ${JSON.stringify(onA)}`);
  const onB = docOf(await members(two, 10, 6), "v");
  if (onB !== undefined) throw new Error(`receiver B should have no doc: ${JSON.stringify(onB)}`);

  // An alias is the SAME type, so it reads the declaration that carries the doc.
  const alias = [
    "type A = {",
    "  /// Documented on A.",
    "  v: i32,",
    "}",
    "type B = A",
    "const b: B = { v: 2 }",
    "print(b)",
    "",
  ].join("\n");
  const viaAlias = docOf(await members(alias, 6, 6), "v");
  if (viaAlias !== "Documented on A.") throw new Error(`via alias: ${JSON.stringify(viaAlias)}`);

  // An anonymous receiver has no declaration at all, so no doc — which is also the answer
  // the name guard gives, and the only case that reaches it.
  const anon = ["const p = { v: 1 }", "print(p)", ""].join("\n");
  const anonDoc = docOf(await members(anon, 1, 6), "v");
  if (anonDoc !== undefined) throw new Error(`anonymous: ${JSON.stringify(anonDoc)}`);
});

// A `string` builtin method has no source declaration, so it can carry no doc — and must
// still render the bare fence rather than an empty paragraph.
Deno.test({ name: "field docs: a `string` builtin method has no doc", ignore }, async () => {
  const src = ['const s = "hi"', "print(s)", ""].join("\n");
  const cs = await members(src, 1, 6);
  const slice = cs.find((c) => c.name === "slice");
  if (slice === undefined) throw new Error("no `slice` offered on a string receiver");
  if (slice.doc !== undefined) throw new Error(`slice.doc: ${JSON.stringify(slice.doc)}`);
});

Deno.test({ name: "field docs: the rendered panel is prose above the fence, or the bare fence", ignore }, async () => {
  const cs = await members(SRC, RECV.line, RECV.character);
  const render = (name: string) => {
    const c = cs.find((x) => x.name === name)!;
    return docMarkdown(c.detail ?? "", "vital", c.doc);
  };
  const x = render("x");
  if (!x.startsWith("The horizontal coordinate.\nThe second line of the same block.\n\n```vital\n")) {
    throw new Error(`x panel: ${JSON.stringify(x)}`);
  }
  const y = render("y");
  if (y.includes("\n\n") || !y.startsWith("```vital\n") || !y.endsWith("\n```")) {
    throw new Error(`y panel should be the bare fence: ${JSON.stringify(y)}`);
  }
});

// ── the MULTI-MODULE face (D1863) ────────────────────────────────────────────
// A suite of single-file fixtures could not see the defect where the doc table is empty for
// every module the token cache serves. A FRESH checker per arm: one asked both would let the
// single-module arm's rows answer the multi-module arm's query.

const MM_LIB = 'export function helper(): i32 { return 7 }\n';
const mmRead = (key: string): string | undefined =>
  key.endsWith("lib") || key.endsWith("lib.vl") ? MM_LIB : undefined;

const MM_TAIL = [
  "type Pt = {",
  "  /// The horizontal coordinate.",
  "  x: i32,",
  "}",
  "const p: Pt = { x: 1 }",
  "print(p)",
  "",
];
const MM_SOLO = ["", ...MM_TAIL].join("\n");
const MM_IMPORTING = [
  'import { helper } from "./lib"',
  ...MM_TAIL.slice(0, 4),
  "const p: Pt = { x: helper() }",
  ...MM_TAIL.slice(5),
].join("\n");
const MM_RECV = { line: 6, character: 6 };

Deno.test({ name: "field docs: an `import` does not silence the panel (D1863)", ignore }, async () => {
  const docOfArm = async (src: string, r: (k: string) => string | undefined) => {
    const ms = await loadWasmChecker(SEED, () => {})!.memberCompletionsAt(
      src,
      "/tmp/main.vl",
      r,
      MM_RECV.line,
      MM_RECV.character,
    );
    return memberCompletionsFromWasm(ms).find((c) => c.name === "x")?.doc;
  };
  const solo = await docOfArm(MM_SOLO, noSiblings);
  const multi = await docOfArm(MM_IMPORTING, mmRead);
  if (solo === undefined) throw new Error("the single-module control has no doc");
  if (multi !== solo) {
    throw new Error(
      `with an import ${JSON.stringify(multi)} != without ${JSON.stringify(solo)}`,
    );
  }
});

// ── the playground, end to end ───────────────────────────────────────────────

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

Deno.test({ name: "field docs: the playground panel carries the same prose", ignore }, async () => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
  // `p.` — the member-completion cursor, one past the dot.
  const src = SRC.replace("print(p)", "print(p.)");
  const cs = await completion(src, { line: 12, character: 8 }, ".");
  const doc = (label: string) => cs.find((c) => c.label === label)?.documentation;
  const x = doc("x");
  if (x === undefined || !x.startsWith("The horizontal coordinate.\n")) {
    throw new Error(`x: ${JSON.stringify(x)}`);
  }
  const y = doc("y");
  if (y === undefined || y.includes("\n\n")) {
    throw new Error(`y should be the bare fence: ${JSON.stringify(y)}`);
  }
});

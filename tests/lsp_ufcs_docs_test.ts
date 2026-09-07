// D9.11, UFCS half (ROADMAP row 32) — the `///` block of a free `self`-function reaches
// the method-completion panel, through the same `docMarkdown` layout hover uses.
//
// `symUfcsScanAt` already banked the declaration token per candidate (`ufcTok`), so the doc
// is `docForDeclTok` over it — the one home the hover and scope queries also go through, so
// a second surface cannot answer a different question about the same declaration.
//
// The DISCRIMINATORS are reused from `lsp_hover_docs_test.ts` and `lsp_completion_docs_test.ts`
// on purpose: three surfaces asking one declaration the same question is the property a
// shared `docForDeclTok` is for, and one case here asserts the answer is byte-for-byte
// hover's rather than assuming it.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  type Completion,
  docMarkdown,
  type UfcsCandidate,
  ufcsCompletions,
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

// One fixture, every case. Every candidate below fits `self: Pt`, so the scan offers all of
// them and the only thing that varies is what stands above the declaration.
const SRC = [
  /*  0 */ "type Pt = { x: i32, y: i32 }",
  /*  1 */ "/// Doubles a point's x.",
  /*  2 */ "/// The second line of the same block.",
  /*  3 */ "function twice(self: Pt): i32 { return self.x * 2 }",
  /*  4 */ "",
  /*  5 */ "function plain(self: Pt): i32 { return self.y }",
  /*  6 */ "",
  /*  7 */ "// Not documentation: two slashes.",
  /*  8 */ "function ordinary(self: Pt): i32 { return self.y }",
  /*  9 */ "",
  /* 10 */ "/// Separated from the declaration by a blank line.",
  /* 11 */ "",
  /* 12 */ "function detached(self: Pt): i32 { return self.y }",
  /* 13 */ "",
  /* 14 */ "/// Documented across two head keywords.",
  /* 15 */ "export function shared(self: Pt): i32 { return self.y }",
  /* 16 */ "",
  /* 17 */ "const p: Pt = { x: 1, y: 2 }",
  /* 18 */ "print(p.x)",
  "",
].join("\n");

// The cursor: on `p` in `p.x` (line 18), which is the receiver the scan resolves.
const RECEIVER = { line: 18, character: 6 };

const candidates = async (): Promise<UfcsCandidate[]> => {
  const checker = loadWasmChecker(SEED, () => {})!;
  return await checker.ufcsCandidatesAt(
    SRC,
    "/tmp/x.vl",
    noSiblings,
    RECEIVER.line,
    RECEIVER.character,
  );
};

// The candidates as the completion pass renders them: nothing is `taken` by a field scan
// here, and every candidate is local, so no item carries an import edit.
const items = async (): Promise<Completion[]> =>
  ufcsCompletions(SRC, "/tmp/x.vl", await candidates(), () => false);

const docOf = (cs: Completion[], name: string): string | undefined => {
  const c = cs.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no UFCS item named ${name}`);
  return c.doc;
};

Deno.test({ name: "ufcs docs: a documented `self`-function carries its block", ignore }, async () => {
  const want = "Doubles a point's x.\nThe second line of the same block.";
  const got = docOf(await items(), "twice");
  if (got !== want) {
    throw new Error(`twice: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
});

Deno.test({ name: "ufcs docs: a declaration with two head keywords", ignore }, async () => {
  const got = docOf(await items(), "shared");
  if (got !== "Documented across two head keywords.") {
    throw new Error(`shared: got ${JSON.stringify(got)}`);
  }
});

Deno.test({ name: "ufcs docs: undocumented, `//` and a blank line all carry NO doc", ignore }, async () => {
  const cs = await items();
  for (const name of ["plain", "ordinary", "detached"]) {
    const got = docOf(cs, name);
    if (got !== undefined) {
      throw new Error(`${name}: want no doc, got ${JSON.stringify(got)}`);
    }
  }
});

// A trailing `///` comments the code beside it. Its own line and the line below must both
// be undocumented — the same answer hover and scope completion give.
Deno.test({ name: "ufcs docs: a trailing `///` documents nothing", ignore }, async () => {
  const src = [
    "type Pt = { x: i32 }",
    "function tail(self: Pt): i32 { return self.x } /// trailing, not documentation",
    "function after(self: Pt): i32 { return self.x }",
    "const p: Pt = { x: 1 }",
    "print(p.x)",
    "",
  ].join("\n");
  const checker = loadWasmChecker(SEED, () => {})!;
  const cands = await checker.ufcsCandidatesAt(src, "/tmp/x.vl", noSiblings, 4, 6);
  const cs = ufcsCompletions(src, "/tmp/x.vl", cands, () => false);
  for (const name of ["tail", "after"]) {
    const got = docOf(cs, name);
    if (got !== undefined) {
      throw new Error(`${name}: want no doc, got ${JSON.stringify(got)}`);
    }
  }
});

Deno.test({ name: "ufcs docs: every item's doc is byte-for-byte hover's", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const cs = await items();
  // (name, the line/col of that name's DECLARATION) — hover is a position query.
  const decls: [string, number, number][] = [
    ["twice", 3, 10],
    ["plain", 5, 10],
    ["ordinary", 8, 10],
    ["detached", 12, 10],
    ["shared", 15, 18],
  ];
  for (const [name, line, col] of decls) {
    const hover = await checker.docAt(SRC, "/tmp/x.vl", noSiblings, line, col);
    const item = docOf(cs, name);
    if (hover !== item) {
      throw new Error(
        `${name}: hover ${JSON.stringify(hover)} != ufcs item ${JSON.stringify(item)}`,
      );
    }
  }
});

// The panel the editor receives. An undocumented candidate must render the BARE fence —
// what the panel showed before docs existed, with no empty paragraph and no trailing blank.
Deno.test({ name: "ufcs docs: the rendered panel is prose above the fence, or the bare fence", ignore }, async () => {
  const cs = await items();
  const render = (name: string) => {
    const c = cs.find((x) => x.name === name)!;
    return docMarkdown(c.detail ?? "", "vital", c.doc);
  };
  const twice = render("twice");
  if (!twice.startsWith("Doubles a point's x.\nThe second line of the same block.\n\n```vital\n")) {
    throw new Error(`twice panel: ${JSON.stringify(twice)}`);
  }
  const plain = render("plain");
  if (plain.includes("\n\n") || !plain.startsWith("```vital\n") || !plain.endsWith("\n```")) {
    throw new Error(`plain panel should be the bare fence: ${JSON.stringify(plain)}`);
  }
});


// ── the MULTI-MODULE face (D1863) ────────────────────────────────────────────
// Every fixture above is a single file, which is what let the defect stand: the module
// pipeline serves each module's tokens from a cache rather than re-lexing, so the doc table
// was EMPTY for every module and one `import` silenced the panel. The assertion is that the
// same program answers the same with and without an import.

const MM_LIB = 'export function helper(): i32 { return 7 }\n';
const mmRead = (key: string): string | undefined =>
  key.endsWith("lib") || key.endsWith("lib.vl") ? MM_LIB : undefined;

const MM_TAIL = [
  "type Pt = { x: i32, y: i32 }",
  "/// Doubles a point's x.",
  "function twice(self: Pt): i32 { return self.x * 2 }",
  "const p: Pt = { x: 1, y: 2 }",
  "print(p.x)",
  "",
];
const MM_SOLO = ["", ...MM_TAIL].join("\n");
const MM_IMPORTING = [
  'import { helper } from "./lib"',
  ...MM_TAIL.slice(0, 2),
  "function twice(self: Pt): i32 { return self.x * helper() }",
  ...MM_TAIL.slice(3),
].join("\n");
// The receiver `p` in `p.x`, one line past the `twice` declaration in both.
const MM_RECV = { line: 4, character: 6 };

Deno.test({ name: "ufcs docs: an `import` does not silence the panel (D1863)", ignore }, async () => {
  // A FRESH checker per arm: one asked both would let the single-module arm's rows answer
  // the multi-module arm's query — the very staleness this defect is made of.
  const docOf = async (src: string, r: (k: string) => string | undefined) => {
    const cands = await loadWasmChecker(SEED, () => {})!.ufcsCandidatesAt(
      src,
      "/tmp/main.vl",
      r,
      MM_RECV.line,
      MM_RECV.character,
    );
    return ufcsCompletions(src, "/tmp/main.vl", cands, () => false)
      .find((c) => c.name === "twice")?.doc;
  };
  const solo = await docOf(MM_SOLO, noSiblings);
  const multi = await docOf(MM_IMPORTING, mmRead);
  if (solo === undefined) throw new Error("the single-module control has no doc");
  if (multi !== solo) {
    throw new Error(
      `with an import ${JSON.stringify(multi)} != without ${JSON.stringify(solo)}`,
    );
  }
});

// ── the playground, end to end ───────────────────────────────────────────────
// This was a PIN until the adapter's member path called `ufcsCandidatesAt` at all: it ran
// `memberCompletionsFromWasm` alone, so the playground offered no UFCS method and had no
// panel to carry a doc. `playground_lsp_parity_test.ts` could not see that — it grades one
// marker per FEATURE and UFCS is a behaviour inside "completion" — so the parity table now
// carries a second marker for it too.

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

Deno.test({ name: "ufcs docs: the playground offers the method, with its prose", ignore }, async () => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
  // `p.` — the member-completion cursor, one past the dot.
  const src = SRC.replace("print(p.x)", "print(p.)");
  const cs = await completion(src, { line: 18, character: 8 }, ".");
  const byLabel = (l: string) => cs.find((c) => c.label === l);
  // The FIELDS are still there — the UFCS half is added beside them, not instead.
  for (const f of ["x", "y"]) {
    if (byLabel(f) === undefined) throw new Error(`the field \`${f}\` was lost`);
  }
  const twice = byLabel("twice");
  if (twice === undefined) throw new Error(`no \`twice\` item: ${JSON.stringify(cs.map((c) => c.label))}`);
  if (twice.kind !== "function") throw new Error(`twice kind: ${twice.kind}`);
  if (twice.documentation === undefined || !twice.documentation.startsWith("Doubles a point's x.\n")) {
    throw new Error(`twice documentation: ${JSON.stringify(twice.documentation)}`);
  }
  // An UNDOCUMENTED candidate is offered too, with the bare fence.
  const plain = byLabel("plain");
  if (plain === undefined) throw new Error("no `plain` item");
  if (plain.documentation === undefined || plain.documentation.includes("\n\n")) {
    throw new Error(`plain should be the bare fence: ${JSON.stringify(plain.documentation)}`);
  }
});

// ── the helper, without a seed ───────────────────────────────────────────────

Deno.test("ufcs docs: ufcsCompletions carries `doc` through, absent and present", () => {
  const cs = ufcsCompletions(
    "print(1)\n",
    "/tmp/x.vl",
    [
      { name: "a", detail: "() => i32", moduleKey: "", doc: "Documented." },
      { name: "b", detail: "() => i32", moduleKey: "" },
    ],
    () => false,
  );
  const a = cs.find((c) => c.name === "a");
  const b = cs.find((c) => c.name === "b");
  if (a?.doc !== "Documented.") throw new Error(`a.doc: ${JSON.stringify(a?.doc)}`);
  if (b?.doc !== undefined) throw new Error(`b.doc: ${JSON.stringify(b?.doc)}`);
});

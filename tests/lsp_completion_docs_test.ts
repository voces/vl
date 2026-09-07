// D9.11, completion half — the `///` block of an in-scope declaration reaches the
// completion panel, through the same `docMarkdown` layout hover uses.
//
// `Completion.doc` in `lsp/src/typeFeatures.ts` was documented as "the declaration's
// authored `///` doc-comment" and NO wasm-path producer set it, so the panel showed the
// type alone. `symScopeAt` already banked the declaration token per result, so the doc is
// `docRunAbove` over that token.
//
// The DISCRIMINATORS are reused from `lsp_hover_docs_test.ts` on purpose: hover and
// completion must answer the same question the same way, and a doc rule that drifted
// between the two surfaces is exactly the defect a shared `docRunAbove` prevents. Each of
// `//`, a blank line, a trailing `///` and an undocumented declaration must come back with
// NO doc — and, at the item level, with the bare fence rather than an empty paragraph.
//
// Both hosts are graded: `server.ts`'s producer chain (`scopeAt` →
// `scopeCompletionsFromBindings` → `docMarkdown`) through its pure halves, and the
// playground adapter's `completion` export end to end, since that one renders the
// `documentation` string itself.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  type Completion,
  docMarkdown,
  scopeCompletionsFromBindings,
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

// One fixture, every case, so an item's answer is read against the same program the
// others are — a per-case source would hide a table that leaks between declarations. The
// cursor sits on the last line, where every top-level binding is in scope.
const SRC = [
  /*  0 */ "/// Greets a person by name.",
  /*  1 */ "/// The second line of the same block.",
  /*  2 */ 'function greet(who: string): string { return "hi " + who }',
  /*  3 */ "",
  /*  4 */ "/// The answer.",
  /*  5 */ "const answer = 42",
  /*  6 */ "",
  /*  7 */ "function plain(n: i32): i32 { return n }",
  /*  8 */ "",
  /*  9 */ "// Not documentation: two slashes.",
  /* 10 */ "function ordinary(n: i32): i32 { return n }",
  /* 11 */ "",
  /* 12 */ "/// Separated from the declaration by a blank line.",
  /* 13 */ "",
  /* 14 */ "function detached(n: i32): i32 { return n }",
  /* 15 */ "",
  /* 16 */ "/// Documented across two head keywords.",
  /* 17 */ "export function shared(n: i32): i32 { return n }",
  /* 18 */ "",
  /* 19 */ "let trailing = 1 /// trailing, not documentation",
  /* 20 */ "",
  /* 21 */ 'print(greet("a") + answer + plain(1) + ordinary(1) + detached(1) +',
  /* 22 */ "  shared(1) + trailing)",
  "",
].join("\n");

// The cursor for every case: the blank line after the program, where every top-level
// binding is in scope.
const CURSOR = { line: 20, character: 0 };

const completionsFor = async (src: string): Promise<Completion[]> => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const bindings = await checker.scopeAt(
    src,
    "/tmp/x.vl",
    noSiblings,
    CURSOR.line,
    CURSOR.character,
  );
  return scopeCompletionsFromBindings(bindings);
};

const docOf = (cs: Completion[], name: string): string | undefined => {
  const c = cs.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no completion named ${name}`);
  return c.doc;
};

Deno.test({ name: "completion docs: a documented function and const carry their block", ignore }, async () => {
  const cs = await completionsFor(SRC);
  const greet = docOf(cs, "greet");
  const want = "Greets a person by name.\nThe second line of the same block.";
  if (greet !== want) {
    throw new Error(`greet: want ${JSON.stringify(want)}, got ${JSON.stringify(greet)}`);
  }
  const answer = docOf(cs, "answer");
  if (answer !== "The answer.") {
    throw new Error(`answer: want "The answer.", got ${JSON.stringify(answer)}`);
  }
});

// `export function f` puts two keywords between the block and the name.
Deno.test({ name: "completion docs: a declaration with two head keywords", ignore }, async () => {
  const cs = await completionsFor(SRC);
  const got = docOf(cs, "shared");
  if (got !== "Documented across two head keywords.") {
    throw new Error(`shared: got ${JSON.stringify(got)}`);
  }
});

// The four discriminators, in one test so a rule that started attaching the wrong thing
// cannot be read as three unrelated failures.
Deno.test({ name: "completion docs: undocumented, `//`, a blank line and a trailing `///` all carry NO doc", ignore }, async () => {
  const cs = await completionsFor(SRC);
  for (const name of ["plain", "ordinary", "detached", "trailing"]) {
    const got = docOf(cs, name);
    if (got !== undefined) {
      throw new Error(`${name}: want no doc, got ${JSON.stringify(got)}`);
    }
  }
});

// Hover and completion must not drift: both surfaces ask the same declaration the same
// question, and this is the assertion that says so rather than assuming it.
Deno.test({ name: "completion docs: every item's doc is byte-for-byte hover's", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const cs = await completionsFor(SRC);
  // (name, the line/col of that name's DECLARATION) — hover is a position query.
  const decls: [string, number, number][] = [
    ["greet", 2, 10],
    ["answer", 5, 7],
    ["plain", 7, 10],
    ["ordinary", 10, 10],
    ["detached", 14, 10],
    ["shared", 17, 18],
    ["trailing", 19, 5],
  ];
  for (const [name, line, col] of decls) {
    const hover = await checker.docAt(SRC, "/tmp/x.vl", noSiblings, line, col);
    const item = docOf(cs, name);
    if (hover !== item) {
      throw new Error(
        `${name}: hover ${JSON.stringify(hover)} != completion ${JSON.stringify(item)}`,
      );
    }
  }
});

// The item the editor actually receives. An undocumented binding must render the BARE
// fence — the same string the panel showed before docs existed, with no empty paragraph
// and no trailing blank line.
Deno.test({ name: "completion docs: the rendered panel is prose above the fence, or the bare fence", ignore }, async () => {
  const cs = await completionsFor(SRC);
  const render = (name: string) => {
    const c = cs.find((x) => x.name === name)!;
    return docMarkdown(c.detail ?? "", "vital", c.doc);
  };
  const answer = render("answer");
  if (!answer.startsWith("The answer.\n\n```vital\n")) {
    throw new Error(`answer panel: ${JSON.stringify(answer)}`);
  }
  const plain = render("plain");
  if (plain.includes("\n\n") || !plain.startsWith("```vital\n") || !plain.endsWith("\n```")) {
    throw new Error(`plain panel should be the bare fence: ${JSON.stringify(plain)}`);
  }
});

// ── the playground, end to end ───────────────────────────────────────────────
// The adapter renders `documentation` itself, so this grades the string a Monaco user
// sees rather than the `Completion` behind it.

const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;

Deno.test({ name: "completion docs: the playground panel carries the same prose", ignore }, async () => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  initLsp(createWasmChecker(() => instance.exports as unknown as Exports));
  const cs = await completion(SRC, CURSOR);
  const doc = (label: string) => cs.find((c) => c.label === label)?.documentation;
  const answer = doc("answer");
  if (answer !== "The answer.\n\n```vital\ni32\n```") {
    throw new Error(`answer: ${JSON.stringify(answer)}`);
  }
  const plain = doc("plain");
  if (plain === undefined || plain.includes("\n\n")) {
    throw new Error(`plain should be the bare fence: ${JSON.stringify(plain)}`);
  }
});

// ── the helper, without a seed ───────────────────────────────────────────────
// `scopeCompletionsFromBindings` is pure, so the mapping is graded here too — a seed-less
// clone still runs this, and it is where a dropped field would show first.

Deno.test("completion docs: scopeCompletionsFromBindings carries `doc` through, absent and present", () => {
  const cs = scopeCompletionsFromBindings([
    { name: "a", kind: 0, type: "i32", doc: "Documented." },
    { name: "b", kind: 2, type: "() => i32" },
  ]);
  const a = cs.find((c) => c.name === "a");
  const b = cs.find((c) => c.name === "b");
  if (a?.doc !== "Documented.") throw new Error(`a.doc: ${JSON.stringify(a?.doc)}`);
  if (b?.doc !== undefined) throw new Error(`b.doc: ${JSON.stringify(b?.doc)}`);
});

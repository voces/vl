// D9.11 — `///` docs in hover, end to end: the native `docAt` query and the markdown
// layout the editor receives.
//
// The DISCRIMINATORS are the point of this file, not the happy path. A doc query that
// simply reported "the comment above the declaration" would pass a happy-path test and
// then attach a `//` note, an unrelated block two lines up, or a trailing `/// ` that
// comments the code beside it. Each of those has a row here, and each must come back
// UNDOCUMENTED — the same answer an undocumented declaration gives.
//
// The layout half is `docMarkdown`'s (`lsp/src/typeFeatures.ts`), which hover and
// completion share; what this file pins is that an undocumented declaration renders the
// BARE fence, byte for byte what hover produced before docs existed — no paragraph, no
// trailing blank line.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { docMarkdown } from "../lsp/src/typeFeatures.ts";

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

// One fixture, every case, so a cursor's answer is read against the same program the
// others are — a per-case source would hide a table that leaks between declarations.
const SRC = [
  /*  0 */ "/// Greets a person by name.",
  /*  1 */ "/// The second line of the same block.",
  /*  2 */ 'function greet(who: string): string { return "hi " + who }',
  /*  3 */ "",
  /*  4 */ "/// A two-dimensional point.",
  /*  5 */ "type Pt = { x: i32, y: i32 }",
  /*  6 */ "",
  /*  7 */ "/// The answer.",
  /*  8 */ "const answer = 42",
  /*  9 */ "",
  /* 10 */ "function plain(n: i32): i32 { return n }",
  /* 11 */ "",
  /* 12 */ "// Not documentation: two slashes.",
  /* 13 */ "function ordinary(n: i32): i32 { return n }",
  /* 14 */ "",
  /* 15 */ "/// Separated from the declaration by a blank line.",
  /* 16 */ "",
  /* 17 */ "function detached(n: i32): i32 { return n }",
  /* 18 */ "",
  /* 19 */ "/// Documented across two head keywords.",
  /* 20 */ "export function shared(n: i32): i32 { return n }",
  /* 21 */ "",
  /* 22 */ "const p: Pt = { x: 1, y: 2 }",
  /* 23 */ 'print(greet("a") + answer.toString() + plain(1).toString() +',
  /* 24 */ "  ordinary(1).toString() + detached(1).toString() +",
  /* 25 */ "  shared(1).toString() + p.x.toString())",
  "",
].join("\n");

const docAt = async (line: number, character: number): Promise<string | undefined> => {
  const checker = loadWasmChecker(SEED, () => {})!;
  return await checker.docAt(SRC, "/tmp/x.vl", noSiblings, line, character);
};

const wantDoc = async (line: number, character: number, want: string, what: string) => {
  const got = await docAt(line, character);
  if (got !== want) {
    throw new Error(
      `${what}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
    );
  }
};

const wantNoDoc = async (line: number, character: number, what: string) => {
  const got = await docAt(line, character);
  if (got !== undefined) {
    throw new Error(`${what}: want no doc, got ${JSON.stringify(got)}`);
  }
};

Deno.test({ name: "hover docs: a documented function, at its declaration", ignore }, async () => {
  await wantDoc(
    2,
    10,
    "Greets a person by name.\nThe second line of the same block.",
    "greet decl",
  );
});

// The reason the query resolves through the symbol table rather than reading the lines
// above the CURSOR: a use is where a reader actually asks.
Deno.test({ name: "hover docs: a USE shows its declaration's docs", ignore }, async () => {
  await wantDoc(
    23,
    8,
    "Greets a person by name.\nThe second line of the same block.",
    "greet use",
  );
});

Deno.test({ name: "hover docs: a documented `type`, at its declaration and at a use", ignore }, async () => {
  await wantDoc(5, 6, "A two-dimensional point.", "Pt decl");
  await wantDoc(22, 10, "A two-dimensional point.", "Pt use in an annotation");
});

Deno.test({ name: "hover docs: a documented `const`", ignore }, async () => {
  await wantDoc(8, 7, "The answer.", "answer decl");
});

// `export function f` puts two keywords between the block and the name, so a rule that
// looked one line above the NAME token would miss a block above the `export`.
Deno.test({ name: "hover docs: a declaration with two head keywords", ignore }, async () => {
  await wantDoc(20, 18, "Documented across two head keywords.", "shared decl");
});

Deno.test({ name: "hover docs: an UNDOCUMENTED declaration has no doc", ignore }, async () => {
  await wantNoDoc(10, 10, "plain decl");
});

// The discriminator. `//` is the ordinary comment spelling and must render nowhere.
Deno.test({ name: "hover docs: a `//` comment above a declaration is NOT a doc", ignore }, async () => {
  await wantNoDoc(13, 10, "ordinary decl");
});

// The other discriminator: adjacency. A blank line ends the block, the same rule the
// formatter attaches a comment by.
Deno.test({ name: "hover docs: a block separated by a blank line does NOT attach", ignore }, async () => {
  await wantNoDoc(17, 10, "detached decl");
});

// A trailing `///` comments the code beside it; it documents nothing, and the line BELOW
// it must not pick it up either.
Deno.test({ name: "hover docs: a trailing `///` documents nothing", ignore }, async () => {
  const src = [
    "const first = 1 /// trailing, not documentation",
    "const second = 2",
    "print(first + second)",
    "",
  ].join("\n");
  const checker = loadWasmChecker(SEED, () => {})!;
  for (const [line, col, what] of [[0, 7, "first"], [1, 7, "second"]] as const) {
    const got = await checker.docAt(src, "/tmp/x.vl", noSiblings, line, col);
    if (got !== undefined) {
      throw new Error(`${what}: want no doc, got ${JSON.stringify(got)}`);
    }
  }
});

// One space after the slashes is consumed and no more, so an indented continuation keeps
// its own indent — a nested list or an indented code block survives into the markdown.
Deno.test({ name: "hover docs: one space is stripped, further indent is kept", ignore }, async () => {
  const src = [
    "/// Documented.",
    "///   - a nested bullet",
    "///",
    "/// After a bare `///`.",
    "const listy = 1",
    "print(listy)",
    "",
  ].join("\n");
  const checker = loadWasmChecker(SEED, () => {})!;
  const got = await checker.docAt(src, "/tmp/x.vl", noSiblings, 4, 7);
  const want = "Documented.\n  - a nested bullet\n\nAfter a bare `///`.";
  if (got !== want) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
});

// ── the markdown the editor receives ─────────────────────────────────────────
// `server.ts`'s `hoverMarkdown` is `docMarkdown` plus the `MarkupContent` wrapper, so the
// layout is graded here on `docMarkdown` itself — the same function the playground
// adapter composes with.

Deno.test("hover docs: an undocumented hover is the BARE fence — no paragraph, no trailing blank", () => {
  const md = docMarkdown("plain: (n: i32) => i32", "vital", undefined);
  const want = "```vital\nplain: (n: i32) => i32\n```";
  if (md !== want) throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(md)}`);
  // A doc query that answered "" rather than undefined must render identically: the
  // editor shows one hover, not two shapes of it.
  const empty = docMarkdown("plain: (n: i32) => i32", "vital", "");
  if (empty !== want) throw new Error(`empty doc diverged: ${JSON.stringify(empty)}`);
});

Deno.test("hover docs: a documented hover is the prose, a blank line, then the fence", () => {
  const md = docMarkdown("greet: (who: string) => string", "vital", "Greets a person.");
  const want = "Greets a person.\n\n```vital\ngreet: (who: string) => string\n```";
  if (md !== want) throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(md)}`);
});

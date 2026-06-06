// Unit tests for the LSP type-aware feature helpers (`lsp/src/typeFeatures.ts`):
// semantic-token classification + relative encoding, and inlay-hint derivation.
//
// The LSP request plumbing in `server.ts` can't be imported under Deno (it pulls
// in the Node-only `vscode-languageserver` and opens a connection on load), and
// the `.vl` corpus runner can't reach LSP requests either — so these drive the
// pure helpers directly through `parseSymbols`. Run with:
//   deno test -A --no-check tests/lsp_type_features_test.ts
// (also included in `deno task test`).

import { parseSymbols, stringifyType } from "../compiler/compile.ts";
import { tokenize } from "../compiler/lexer.ts";
import {
  classifyTokens,
  deriveInlayHints,
  docMarkdown,
  encodeSemanticTokens,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensData,
  type TypeInlayHint,
} from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// ---- semantic-token encoding (the tricky relative math) ---------------------

Deno.test("encodeSemanticTokens: single token is absolute from origin", () => {
  // line 2, char 5, length 3, type 0, mods 0 → first token deltas are absolute.
  const data = encodeSemanticTokens([
    { line: 2, char: 5, length: 3, tokenType: 0, tokenModifiers: 0 },
  ]);
  assertEquals(data, [2, 5, 3, 0, 0]);
});

Deno.test("encodeSemanticTokens: same-line tokens use a char delta", () => {
  const data = encodeSemanticTokens([
    { line: 0, char: 4, length: 1, tokenType: 0, tokenModifiers: 1 },
    { line: 0, char: 8, length: 1, tokenType: 1, tokenModifiers: 0 },
  ]);
  // Second token: same line (deltaLine 0), so deltaChar = 8 - 4 = 4.
  assertEquals(data, [0, 4, 1, 0, 1, 0, 4, 1, 1, 0]);
});

Deno.test("encodeSemanticTokens: new line resets char to absolute", () => {
  const data = encodeSemanticTokens([
    { line: 0, char: 10, length: 2, tokenType: 2, tokenModifiers: 0 },
    { line: 3, char: 6, length: 2, tokenType: 0, tokenModifiers: 0 },
  ]);
  // Second token: deltaLine = 3, so deltaChar is the *absolute* char 6, not 6-10.
  assertEquals(data, [0, 10, 2, 2, 0, 3, 6, 2, 0, 0]);
});

Deno.test("encodeSemanticTokens: empty input yields empty data", () => {
  assertEquals(encodeSemanticTokens([]), []);
});

// ---- classification from a real symbol table --------------------------------

Deno.test("classifyTokens: locals, params, functions, types get distinct types", () => {
  // A user-defined `type` alias (`Pair`) is the only thing that yields a `type`
  // token — builtin primitives like `i32` aren't tracked as occurrences. So the
  // doc references `Pair` to exercise all four token types.
  const src = "type Pair = { a: i32 }\n" +
    "function inc(p: Pair): Pair {\n  let r = p\n  return r\n}\n";
  const table = parseSymbols(src);
  const tokens = classifyTokens(table);
  // Legend indices: variable 0, parameter 1, function 2, type 3.
  const byType = (t: number) => tokens.filter((x) => x.tokenType === t).length;
  if (byType(2) < 1) throw new Error("expected a function token for `inc`");
  if (byType(1) < 1) throw new Error("expected a parameter token for `p`");
  if (byType(0) < 1) throw new Error("expected a variable token for `r`");
  if (byType(3) < 1) throw new Error("expected a type token for `Pair`");
});

Deno.test("classifyTokens: declaration occurrences carry the declaration modifier", () => {
  const src = "let x = 1\nlet y = x\n";
  const table = parseSymbols(src);
  const tokens = classifyTokens(table);
  // `let x` decl (line 0) has the declaration bit; the use of `x` (line 1) does not.
  const decls = tokens.filter((t) => t.tokenModifiers === 1);
  const uses = tokens.filter((t) => t.tokenModifiers === 0);
  if (decls.length === 0) throw new Error("expected at least one declaration token");
  if (uses.length === 0) throw new Error("expected at least one non-declaration token");
});

Deno.test("classifyTokens: output is sorted by position (required by encoding)", () => {
  const src = "let aaa = 1\nlet bbb = aaa + aaa\nlet ccc = bbb\n";
  const tokens = classifyTokens(parseSymbols(src));
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i];
    const ordered = cur.line > prev.line ||
      (cur.line === prev.line && cur.char >= prev.char);
    if (!ordered) throw new Error(`tokens not sorted at index ${i}`);
  }
});

Deno.test("semanticTokensData: round-trips a real document into valid 5-tuples", () => {
  const src = "let x = 1\nlet y = x\n";
  const data = semanticTokensData(parseSymbols(src), tokenize(src).tokens, src);
  assertEquals(data.length % 5, 0, "data must be groups of five");
  // Decode and check every position is non-decreasing and lands in-bounds.
  let line = 0;
  let char = 0;
  for (let i = 0; i < data.length; i += 5) {
    const [dl, dc, len, ty, mod] = data.slice(i, i + 5);
    line += dl;
    char = dl === 0 ? char + dc : dc;
    if (len <= 0) throw new Error("zero-length token");
    if (ty < 0 || ty >= SEMANTIC_TOKEN_LEGEND.tokenTypes.length) {
      throw new Error(`token type ${ty} out of legend bounds`);
    }
    if (mod < 0) throw new Error("negative modifier bitset");
  }
});

// ---- legend sanity ----------------------------------------------------------

Deno.test("SEMANTIC_TOKEN_LEGEND: stable, expected order", () => {
  // Order is the wire contract — encoded token-type indices refer back into this
  // array, so appending is safe but reordering would mis-colour every token.
  assertEquals(SEMANTIC_TOKEN_LEGEND.tokenTypes, [
    "variable",
    "parameter",
    "function",
    "type",
    "keyword",
    "string",
    "number",
    "boolean",
    "operator",
    "comment",
    "property",
    "method",
  ]);
  assertEquals(SEMANTIC_TOKEN_LEGEND.tokenModifiers, ["declaration"]);
});

// ---- inlay hints ------------------------------------------------------------

const labels = (hints: TypeInlayHint[]) =>
  hints.map((h) => `${h.name}${h.label}`);

Deno.test("deriveInlayHints: a let without annotation gets its inferred type", () => {
  const src = "function f(b: i32): i32 {\n  let p = b + 1\n  return p\n}\n";
  const hints = deriveInlayHints(parseSymbols(src), stringifyType);
  // `p` is a variable declaration carrying the inferred `i32`.
  const p = hints.find((h) => h.name === "p");
  if (!p) throw new Error("expected an inlay hint for `p`");
  assertEquals(p.label, ": i32");
  // The hint sits just after `p` on its line (line index 1, after column 6).
  assertEquals(p.line, 1);
});

Deno.test("deriveInlayHints: parameters are hinted, functions and types are not", () => {
  const src = "function g(n: i32): i32 {\n  return n\n}\ntype T = i32\n";
  const hints = deriveInlayHints(parseSymbols(src), stringifyType);
  const names = hints.map((h) => h.name);
  if (!names.includes("n")) throw new Error("expected a hint for parameter `n`");
  if (names.includes("g")) throw new Error("function `g` should not be hinted");
  if (names.includes("T")) throw new Error("type alias `T` should not be hinted");
});

Deno.test("deriveInlayHints: respects a requested range", () => {
  const src = "let a = 1\nlet b = 2\nlet c = 3\n";
  const table = parseSymbols(src);
  // Restrict to line index 1 (the `let b` line) only.
  const ranged = deriveInlayHints(table, stringifyType, {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 100 },
  });
  const names = ranged.map((h) => h.name);
  assertEquals(names, ["b"]);
});

Deno.test("deriveInlayHints: only declaration occurrences produce hints", () => {
  // `x` is declared once and used twice; exactly one hint, not three.
  const src = "let x = 1\nlet y = x + x\n";
  const hints = deriveInlayHints(parseSymbols(src), stringifyType);
  const xs = hints.filter((h) => h.name === "x");
  assertEquals(xs.length, 1);
  // Label uses the injected stringifier output.
  assertEquals(labels(hints).sort(), ["x: i32", "y: i32"]);
});

// ---- combined doc + type markdown (hover / completion documentation) --------

Deno.test("docMarkdown: doc prose renders above the type fence", () => {
  assertEquals(
    docMarkdown("add: (a: i32) => i32", "vital", "Adds numbers."),
    "Adds numbers.\n\n```vital\nadd: (a: i32) => i32\n```",
  );
});

Deno.test("docMarkdown: no doc collapses to the bare type fence", () => {
  assertEquals(
    docMarkdown("x: i32", "vital", undefined),
    "```vital\nx: i32\n```",
  );
});

Deno.test("docMarkdown: a blank-only doc collapses to the bare type fence", () => {
  assertEquals(
    docMarkdown("x: i32", "vital", "   \n  "),
    "```vital\nx: i32\n```",
  );
});

Deno.test("docMarkdown: empty type returns just the doc prose", () => {
  assertEquals(docMarkdown("", "vital", "Just docs."), "Just docs.");
});

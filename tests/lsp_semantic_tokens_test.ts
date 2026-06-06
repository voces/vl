// Unit tests for full-document semantic tokens (roadmap D5):
// `lsp/src/typeFeatures.ts` `classifyDocument` / `semanticTokensData`.
//
// As with the other LSP helper tests, the request plumbing in `server.ts` can't
// be imported under Deno (it pulls in the Node-only `vscode-languageserver` and
// opens a connection on load), so these drive the pure helpers directly through
// `parseSymbols` + `tokenize`. The wire format is delta-encoded
// `[deltaLine, deltaChar, length, tokenType, tokenModifiers]` 5-tuples; we decode
// back to absolute (line, char, length, typeName, isDecl) and assert on those, so
// the tests read in terms of classifications rather than raw deltas. Run with:
//   deno test -A --no-check tests/lsp_semantic_tokens_test.ts
// (also included in `deno task test`).

import { parseSymbols } from "../compiler/compile.ts";
import { tokenize } from "../compiler/lexer.ts";
import {
  classifyDocument,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensData,
} from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const TYPE_NAMES: readonly string[] = SEMANTIC_TOKEN_LEGEND.tokenTypes;
const DECLARATION_BIT = 1; // index 0 in tokenModifiers

/** A decoded token: absolute position + the legend's *name* for its type. */
type Decoded = {
  line: number;
  char: number;
  length: number;
  type: string;
  isDecl: boolean;
};

/** Decode the flat delta-encoded `data` array back into absolute tokens. */
const decode = (data: number[]): Decoded[] => {
  if (data.length % 5 !== 0) throw new Error("data not in groups of five");
  const out: Decoded[] = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i < data.length; i += 5) {
    const [dl, dc, length, ty, mod] = data.slice(i, i + 5);
    line += dl;
    char = dl === 0 ? char + dc : dc;
    out.push({
      line,
      char,
      length,
      type: TYPE_NAMES[ty],
      isDecl: (mod & DECLARATION_BIT) !== 0,
    });
  }
  return out;
};

/** Decode a full document's semantic tokens straight from source. */
const tokensOf = (src: string): Decoded[] =>
  decode(semanticTokensData(parseSymbols(src), tokenize(src).tokens, src));

/** Find the (first) decoded token covering line/char. */
const at = (toks: Decoded[], line: number, char: number): Decoded | undefined =>
  toks.find((t) =>
    t.line === line && char >= t.char && char < t.char + t.length
  );

// ---- representative program: every legend category present ------------------

Deno.test("classifyDocument: a representative program classifies each category", () => {
  // Line 0:  type Pair = { a: i32 }
  // Line 1:  // a comment
  // Line 2:  function inc(p: Pair): Pair {
  // Line 3:    let r = p.a + 1
  // Line 4:    let ok = true
  // Line 5:    return r
  // Line 6:  }
  const src = [
    "type Pair = { a: i32 }",
    "// a comment",
    "function inc(p: Pair): Pair {",
    "  let r = p.a + 1",
    "  return r",
    "}",
    "",
  ].join("\n");
  const toks = tokensOf(src);

  // `type` keyword (line 0, col 0).
  assertEquals(at(toks, 0, 0)?.type, "keyword");
  // `Pair` alias declaration (line 0, col 5) — a `type`, with declaration mod.
  const pairDecl = at(toks, 0, 5);
  assertEquals(pairDecl?.type, "type");
  assertEquals(pairDecl?.isDecl, true);

  // The comment line is one `comment` token spanning `// a comment`.
  const comment = at(toks, 1, 0);
  assertEquals(comment?.type, "comment");
  assertEquals(comment?.length, "// a comment".length);

  // `function` keyword and `inc` function declaration.
  assertEquals(at(toks, 2, 0)?.type, "keyword");
  const inc = at(toks, 2, 9); // `inc` starts at col 9
  assertEquals(inc?.type, "function");
  assertEquals(inc?.isDecl, true);

  // `p` parameter declaration (col 13), and `Pair` type-position uses (cols
  // 16, 23).
  const p = at(toks, 2, 13);
  assertEquals(p?.type, "parameter");
  assertEquals(p?.isDecl, true);
  assertEquals(at(toks, 2, 16)?.type, "type");
  assertEquals(at(toks, 2, 23)?.type, "type");

  // `let` keyword, `r` variable declaration, `p` parameter use.
  assertEquals(at(toks, 3, 2)?.type, "keyword");
  const r = at(toks, 3, 6);
  assertEquals(r?.type, "variable");
  assertEquals(r?.isDecl, true);
  const pUse = at(toks, 3, 10);
  assertEquals(pUse?.type, "parameter");
  assertEquals(pUse?.isDecl, false);

  // The `+` operator (col 14) and the `1` number literal (col 16) on line 3.
  assertEquals(at(toks, 3, 14)?.type, "operator"); // `+`
  assertEquals(at(toks, 3, 16)?.type, "number"); // `1`

  // `return` keyword and the `r` variable use on line 4.
  assertEquals(at(toks, 4, 2)?.type, "keyword");
  assertEquals(at(toks, 4, 9)?.type, "variable");
});

Deno.test("classifyDocument: string and boolean literals are classified", () => {
  const src = 'let s = "hi"\nlet b = true\nlet n = null\n';
  const toks = tokensOf(src);
  assertEquals(at(toks, 0, 8)?.type, "string"); // `"hi"`
  assertEquals(at(toks, 1, 8)?.type, "boolean"); // `true`
  assertEquals(at(toks, 2, 8)?.type, "boolean"); // `null`
});

Deno.test("classifyDocument: symbol-table classification wins over lexical for identifiers", () => {
  // `inc` is lexed as a plain ID; the symbol table knows it's a function — the
  // merge must surface `function`, never an undifferentiated identifier.
  const src = "function inc(x: i32): i32 {\n  return x\n}\nlet y = inc(1)\n";
  const toks = tokensOf(src);
  // Declaration on line 0 and the call use on line 3 both classify as function.
  const decl = at(toks, 0, 9);
  assertEquals(decl?.type, "function");
  assertEquals(decl?.isDecl, true);
  const call = at(toks, 3, 8);
  assertEquals(call?.type, "function");
  assertEquals(call?.isDecl, false);
});

Deno.test("classifyDocument: a `//` inside a string is not treated as a comment", () => {
  const src = 'let url = "http://x"\n';
  const toks = tokensOf(src);
  // The whole `"http://x"` is one string token; nothing on the line is a comment.
  assertEquals(at(toks, 0, 10)?.type, "string");
  assertEquals(toks.some((t) => t.type === "comment"), false);
});

Deno.test("classifyDocument: operators are classified, plain punctuation is not", () => {
  const src = "let a = 1\nlet b = a == a && a != a\n";
  const toks = tokensOf(src);
  // `==`, `&&`, `!=` are operators.
  const ops = toks.filter((t) => t.line === 1 && t.type === "operator");
  if (ops.length < 3) throw new Error(`expected >=3 operators, got ${ops.length}`);
  // The `=` in `let b =` is also an operator (EQUAL).
  assertEquals(at(toks, 1, 6)?.type, "operator");
});

Deno.test("semanticTokensData: output is sorted and in-bounds", () => {
  const src = "type T = i32\nfunction f(x: T): T {\n  let y = x\n  return y\n}\n";
  const data = semanticTokensData(parseSymbols(src), tokenize(src).tokens, src);
  assertEquals(data.length % 5, 0, "data must be groups of five");
  const toks = decode(data);
  for (let i = 1; i < toks.length; i++) {
    const prev = toks[i - 1];
    const cur = toks[i];
    const ordered = cur.line > prev.line ||
      (cur.line === prev.line && cur.char >= prev.char);
    if (!ordered) throw new Error(`tokens not sorted at index ${i}`);
  }
  for (const t of toks) {
    if (t.length <= 0) throw new Error("zero-length token");
    if (!TYPE_NAMES.includes(t.type)) {
      throw new Error(`unknown token type ${t.type}`);
    }
  }
});

// `classifyDocument` is exercised directly above via `tokensOf`/`semanticTokensData`;
// this asserts the merge function is exported and usable on its own too.
Deno.test("classifyDocument: returns ClassifiedToken records (direct call)", () => {
  const src = "let x = 1\n";
  const tokens = classifyDocument(
    parseSymbols(src),
    tokenize(src).tokens,
    src,
  );
  // `let` keyword, `x` variable decl, `1` number — at least three tokens.
  if (tokens.length < 3) {
    throw new Error(`expected >=3 tokens, got ${tokens.length}`);
  }
});

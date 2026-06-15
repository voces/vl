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
  semanticTokensDataFromWasm,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmChecker.ts";

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

Deno.test("classifyDocument: booleans are classified; strings are left to the grammar", () => {
  const src = 'let s = "hi"\nlet b = true\nlet n = null\n';
  const toks = tokensOf(src);
  // Strings are NOT semantically tokenized — a whole-string token would override
  // the grammar's `constant.character.escape` scope (killing `\n` highlighting).
  assertEquals(at(toks, 0, 8), undefined); // `"hi"` — the grammar colors strings
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
  // `//` inside a string must not become a comment token (the comment scan tracks
  // quote state). Strings are left to the grammar, so there's no string token
  // either — nothing on the line is a comment.
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

// ---- LSP-on-wasm Stage 2: the wasm identifier classification ----------------
// Seed-gated (mirrors tests/lsp_wasm_checker_test.ts): the wasm `tokensAt` must
// classify identifiers the SAME way the TS symbol-table pass does, for the kinds
// this slice covers (variable / parameter / function). Literals/keywords/
// operators/comments/members stay TS and aren't asserted here.

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
// The legend's first three indices ARE the wasm `bindKind` convention.
const KIND_NAME = ["variable", "parameter", "function"] as const;

Deno.test({
  name: "wasm-tokens: identifier classification matches the TS symbol table",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // `f` (function), `n` (parameter), `r` (variable) decls + a `n` param use and
  // an `f` call use — one of each binding kind this slice colours.
  const src = [
    "function f(n: i32): i32 {",
    "  let r = n + 1",
    "  return r",
    "}",
    "let y = f(2)",
    "",
  ].join("\n");

  const wasm = await checker.tokensAt(src, "/tmp/x.vl", noSiblings);
  // Every wasm token, keyed by position, with its kind NAME + decl flag.
  const wasmAt = new Map(
    wasm.map((t) => [
      `${t.line}:${t.char}`,
      { type: KIND_NAME[t.bindKind], isDecl: t.isDecl, length: t.length },
    ]),
  );

  // The TS identifier classifications (binding-kind tokens only) for the same src.
  const tsToks = tokensOf(src).filter((t) =>
    (KIND_NAME as readonly string[]).includes(t.type)
  );
  if (tsToks.length === 0) throw new Error("no TS identifier tokens to compare");

  for (const ts of tsToks) {
    const w = wasmAt.get(`${ts.line}:${ts.char}`);
    if (!w) {
      throw new Error(
        `wasm missing identifier at ${ts.line}:${ts.char} (${ts.type})`,
      );
    }
    if (w.type !== ts.type || w.isDecl !== ts.isDecl || w.length !== ts.length) {
      throw new Error(
        `mismatch at ${ts.line}:${ts.char}: ts ${ts.type}/${ts.isDecl}/${ts.length} ` +
          `vs wasm ${w.type}/${w.isDecl}/${w.length}`,
      );
    }
  }

  // Spot-check the kinds are actually present (not all the same).
  const f = wasmAt.get("0:9"); // `f` decl
  if (f?.type !== "function" || !f.isDecl) {
    throw new Error(`expected f as a function decl, got ${JSON.stringify(f)}`);
  }
  const n = wasmAt.get("0:11"); // `n` param decl
  if (n?.type !== "parameter" || !n.isDecl) {
    throw new Error(`expected n as a parameter decl, got ${JSON.stringify(n)}`);
  }
  const r = wasmAt.get("1:6"); // `r` variable decl
  if (r?.type !== "variable" || !r.isDecl) {
    throw new Error(`expected r as a variable decl, got ${JSON.stringify(r)}`);
  }
});

// ---- kill-TS: the wasm LEXICAL slice + whole-document wasm-only assembly ------
// `lexicalTokensAt` is the native counterpart of the TS `tokenize` +
// `lexicalTokenType` + comment scan; `semanticTokensDataFromWasm` assembles a
// whole document from the wasm identifier + lexical + member slices with NO TS.

// The whole document's semantic tokens sourced ENTIRELY from the wasm checker.
const wasmTokensOf = async (
  checker: ReturnType<typeof loadWasmChecker>,
  src: string,
): Promise<Decoded[]> => {
  const c = checker!;
  const idents = await c.tokensAt(src, "/tmp/x.vl", noSiblings);
  const lexical = c.lexicalTokensAt(src);
  const members = await c.memberTokensAt(src, "/tmp/x.vl", noSiblings);
  return decode(semanticTokensDataFromWasm(idents, lexical, members));
};

Deno.test({
  name: "wasm-lexical: classifies keywords / operators / literals / comments",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const lex = checker.lexicalTokensAt(
    "let x = 1 + 2 // hi\nif x == 3 { return true }\n",
  );
  const cls = new Map(
    lex.map((t) => [`${t.line}:${t.char}`, t.tokenClass]),
  );
  // class: 0=keyword 1=operator 2=number 3=boolean 4=comment
  assertEquals(cls.get("0:0"), 0, "`let` keyword");
  assertEquals(cls.get("0:6"), 1, "`=` operator");
  assertEquals(cls.get("0:8"), 2, "`1` number");
  assertEquals(cls.get("0:10"), 1, "`+` operator");
  assertEquals(cls.get("0:14"), 4, "`// hi` comment");
  assertEquals(cls.get("1:0"), 0, "`if` keyword");
  // `==` (EQ) — the host's old `lexicalTokenType` never matched this kind, so it
  // went uncoloured; the native classifier keys off the real lexer tag.
  assertEquals(cls.get("1:5"), 1, "`==` operator (drift fix)");
  assertEquals(cls.get("1:12"), 0, "`return` keyword");
  assertEquals(cls.get("1:19"), 3, "`true` boolean");
});

Deno.test({
  name: "wasm-lexical: every operator kind the lexer emits is coloured",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // `/` and `%` (SLASH/PERCENT) were among the kinds the TS host mislabelled and
  // dropped; assert the native pass colours them as operators.
  const lex = checker.lexicalTokensAt("let q = 7 / 2 % 3\n");
  const cls = new Map(lex.map((t) => [`${t.line}:${t.char}`, t.tokenClass]));
  assertEquals(cls.get("0:10"), 1, "`/` operator");
  assertEquals(cls.get("0:14"), 1, "`%` operator");
});

Deno.test({
  name: "wasm-lexical: whole-document wasm-only assembly covers the TS feature",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = [
    "type Pair = { a: i32 }",
    "// a comment",
    "function inc(p: Pair): Pair {",
    "  let r = p.a + 1",
    "  return r",
    "}",
    "",
  ].join("\n");
  const toks = await wasmTokensOf(checker, src);
  const find = (l: number, c: number) =>
    toks.find((t) => t.line === l && c >= t.char && c < t.char + t.length);

  // Keyword / type / function / parameter / variable / number / operator /
  // comment all classify from the wasm-only assembly — the TS path's coverage.
  assertEquals(find(0, 0)?.type, "keyword", "`type`");
  assertEquals(find(1, 0)?.type, "comment", "`// a comment`");
  assertEquals(find(1, 0)?.length, "// a comment".length);
  assertEquals(find(2, 0)?.type, "keyword", "`function`");
  assertEquals(find(2, 9)?.type, "function", "`inc` decl");
  assertEquals(find(2, 13)?.type, "parameter", "`p` decl");
  assertEquals(find(3, 2)?.type, "keyword", "`let`");
  assertEquals(find(3, 6)?.type, "variable", "`r` decl");
  assertEquals(find(3, 14)?.type, "operator", "`+`");
  assertEquals(find(3, 16)?.type, "number", "`1`");
  // `p.a` member `a` (line 3, col 12) classifies as a property from the wasm
  // member slice — no TS AST walk.
  assertEquals(find(3, 12)?.type, "property", "`a` member");
});

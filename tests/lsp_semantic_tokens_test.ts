// Unit tests for full-document semantic tokens (roadmap D5) off the self-hosted
// wasm checker: `lsp/src/typeFeatures.ts` `semanticTokensDataFromWasm`.
//
// As with the other LSP helper tests, the request plumbing in `server.ts` can't
// be imported under Deno (it pulls in the Node-only `vscode-languageserver` and
// opens a connection on load), so these drive the pure helpers directly. The
// wire format is delta-encoded `[deltaLine, deltaChar, length, tokenType,
// tokenModifiers]` 5-tuples; we decode back to absolute (line, char, length,
// typeName, isDecl) and assert on those, so the tests read in terms of
// classifications rather than raw deltas. Run with:
//   deno test -A --no-check tests/lsp_semantic_tokens_test.ts
// (also included in `deno task test`).

import {
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

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

// ---- LSP-on-wasm Stage 2: the wasm identifier classification ----------------
// Seed-gated (mirrors tests/lsp_wasm_checker_test.ts): the wasm `tokensAt` must
// classify identifiers variable / parameter / function.

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
  name: "wasm-tokens: identifier classification (variable / parameter / function)",
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

Deno.test({
  name: "wasm-tokens: an importer's tokens exclude the dependency's (module-0 only)",
  ignore,
}, async () => {
  // Regression: the occurrence table spans every committed module, each with its
  // own module-local line/col. Without filtering to the entry module, a
  // dependency's decls (here mathx's `add`/`square` + their params, at mathx's
  // lines) bleed onto the importer's display — corrupting the `import` lines.
  const checker = loadWasmChecker(SEED, () => {})!;
  const main = `import { add, square } from "./mathx"\nlet r = add(square(3), 4)\nprint(r)\n`;
  const mathx =
    `export function add(a: i32, b: i32): i32 {\n  return a + b\n}\nexport function square(n: i32): i32 {\n  return n * n\n}\n`;
  const reader = (k: string) =>
    ({ "main.vl": main, "mathx.vl": mathx } as Record<string, string>)[k];

  const wasm = await checker.tokensAt(main, "main.vl", reader);
  // No token may sit on the `import` lines (0 and 1) — those came only from the
  // dependency bleed; main.vl's own tokens start at line 1 (`let r = …`).
  const onImportLine = wasm.filter((t) => t.line === 0);
  if (onImportLine.length !== 0) {
    throw new Error(`dependency tokens bled onto the import line: ${JSON.stringify(onImportLine)}`);
  }
  // The importer's OWN tokens survive: `add`/`square` uses (functions) on line 1.
  const addUse = wasm.find((t) => t.line === 1 && t.char === 8);
  if (addUse?.bindKind !== 2) {
    throw new Error(`expected the local \`add\` use as a function, got ${JSON.stringify(addUse)}`);
  }
});

Deno.test({
  name: "wasm-tokens: a deep-`is` program's generated walkers reach no query family",
  ignore,
}, async () => {
  // A `r is Cfg` over a json-shape type is a runtime shape walk, so a SECOND
  // check pass generates predicate/builder functions as VL source, splices them
  // onto the token stream and re-checks — with the symbol table on. Every table
  // that re-check fills is one the editor reads, so the walkers arrived as
  // semantic tokens, inlay hints and completions at lines past the end of the
  // file. The three families are graded together because one guard serves them
  // all: an occurrence at a generated token is never recorded.
  // BOTH SPELLINGS: with an import the graph goes through the module pipeline,
  // which has always run the second pass, and without one it takes the
  // single-source path, which now does too. A guard wired for one is silent
  // about the other.
  const checker = loadWasmChecker(SEED, () => {})!;
  const body = [
    "type Json = null | boolean | f64 | string | Json[] | { [string]: Json }",
    "type Cfg = { port: i32, host: string | null }",
    "function a(r: Json): i32 { if r is Cfg { return bump(r.port) }  0 }",
    "const m: { [string]: Json } = Map()",
    "const n = a(m)",
    "print(n)",
    "",
  ];
  const util = "export function bump(x: i32): i32 {\n  x + 1\n}\n";
  const reader = (k: string) => k.endsWith("util.vl") ? util : undefined;
  const faces: [string, string, (k: string) => string | undefined, number][] = [
    ["imported", `import { bump } from "./util"\n${body.join("\n")}`, reader, 1],
    ["single-file", body.join("\n").replace("bump(r.port)", "r.port"), noSiblings, 0],
  ];

  for (const [face, src, read, off] of faces) {
    const lines = src.split("\n").length;
    const past = <T extends { line: number }>(xs: T[]) => xs.filter((x) => x.line >= lines);
    const toks = await checker.tokensAt(src, "/proj/main.vl", read);
    if (past(toks).length !== 0) {
      throw new Error(
        `${face}: tokens past the end of a ${lines}-line file: ${JSON.stringify(past(toks))}`,
      );
    }
    const hints = await checker.inlayHintsAt(src, "/proj/main.vl", read);
    if (past(hints).length !== 0) {
      throw new Error(`${face}: inlay hints past the end: ${JSON.stringify(past(hints))}`);
    }
    const names = (await checker.scopeAt(src, "/proj/main.vl", read, 4 + off, 0))
      .map((s) => s.name);
    const generated = names.filter((n) => n.startsWith("__vl") || n.startsWith("__vj"));
    if (generated.length !== 0) {
      throw new Error(`${face}: walker names offered as completions: ${generated.join(" ")}`);
    }
    // And the user's own program is still fully classified — the guard must not
    // have swallowed the source it was written to protect.
    const want = face === "imported" ? "bump a m n" : "a m n";
    if (names.join(" ") !== want) {
      throw new Error(`${face}: want the bindings ${want}, got ${JSON.stringify(names)}`);
    }
    const nUse = toks.find((t) => t.line === 5 + off && t.char === 6);
    if (nUse?.bindKind !== 0) {
      throw new Error(`${face}: expected the \`n\` use as a variable, got ${JSON.stringify(nUse)}`);
    }
  }
});

// ---- kill-TS: the wasm LEXICAL slice + whole-document wasm-only assembly ------
// `lexicalTokensAt` is the native counterpart of the TS `tokenize` + comment
// scan; `semanticTokensDataFromWasm` assembles a whole document from the wasm
// identifier + lexical + member slices with NO TS.

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
  name: "wasm-lexical: a scientific float literal is ONE number token, whole span",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // The exponent is part of the LEXEME, so the editor must colour `1.5e-7` as one
  // number rather than a number followed by an identifier and a minus — which is
  // what a `-`-splitting lexer would hand the highlighter.
  const src = "let a = 1.5e-7\nlet b = 2E+10\n";
  const lex = checker.lexicalTokensAt(src);
  const at = new Map(lex.map((t) => [`${t.line}:${t.char}`, t]));
  const a = at.get("0:8");
  assertEquals([a?.tokenClass, a?.length], [2, 6], "`1.5e-7` one number token");
  const b = at.get("1:8");
  assertEquals([b?.tokenClass, b?.length], [2, 5], "`2E+10` one number token");
  // No stray token inside either lexeme (a split would put one at the sign).
  if (lex.some((t) => t.line === 0 && t.char > 8 && t.char < 14)) {
    throw new Error("the exponent must not lex as separate tokens");
  }
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

// ---- the arrow fuse: `=>` renders as ONE keyword token, not two plain ops ----
// The lexer emits `=` and `>` as two one-char operator tokens; themes leave the
// operator scope at default foreground, so the arrow rendered white. With the
// source supplied, the assembly fuses the pair into one keyword-class token
// (the TS convention — its arrow is scoped keyword-ish). Without the source
// (the playground's current call shape) the old two-token form is preserved.

Deno.test({ name: "wasm-lexical: `=>` fuses to one keyword token when source is supplied", ignore }, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = "const f = (a: i32) => a + 1\n";
  const lexical = checker.lexicalTokensAt(src);
  const fused = decode(semanticTokensDataFromWasm([], lexical, [], src));
  const arrow = fused.find((t) => t.line === 0 && t.char === 19);
  if (arrow === undefined || arrow.type !== "keyword" || arrow.length !== 2) {
    throw new Error(`expected one 2-char keyword token at 0:19, got ${JSON.stringify(arrow)}`);
  }
  if (fused.some((t) => t.line === 0 && t.char === 20)) {
    throw new Error("the second half of the arrow must be consumed by the fuse");
  }
  // Back-compat: no source → the two operator chars survive unfused.
  const unfused = decode(semanticTokensDataFromWasm([], lexical, []));
  const half = unfused.find((t) => t.line === 0 && t.char === 20);
  if (half === undefined || half.type !== "operator") {
    throw new Error(`sourceless call must keep the old shape, got ${JSON.stringify(half)}`);
  }
  // A real `>=` comparison must NOT fuse (lexeme check, not class adjacency).
  const cmp = checker.lexicalTokensAt("const b = 1 >= 2\n");
  const cmpFused = decode(semanticTokensDataFromWasm([], cmp, [], "const b = 1 >= 2\n"));
  const ge = cmpFused.filter((t) => t.line === 0 && t.char >= 12 && t.char <= 13);
  if (ge.some((t) => t.type === "keyword")) {
    throw new Error(`\`>=\` must stay operator-classed, got ${JSON.stringify(ge)}`);
  }
});

// ---- interpolated literals: text parts colour as string, holes do not --------
// An interpolated literal is NOT one token — its text runs arrive as the split
// HEAD/MID/TAIL kinds with the hole EXPRESSIONS lexed in between — so leaving it
// to the TextMate grammar would paint a hole's identifiers as string content.
// `lexClassOf` gives those kinds class 5 (string), which covers exactly the text
// parts and the `\{` / `}` delimiters riding on them; everything inside a hole
// keeps the colour it would have anywhere else.
//
// BOTH QUOTED FORMS mint those kinds, and both are pinned here. The geometry is
// identical because `\{` is two characters just as `${` was, which is the point:
// nothing downstream of the lexer learned a second literal form exists.
//
// The spans are what this pins. For `const s = `v=\{x} ok``:
//   col 10 `` `v=\{ `` — 5 chars, string      (HEAD: delimiter + text + `\{`)
//   col 15 `x`         — the hole, NOT string (the symbol slice owns it)
//   col 16 `} ok``     — 5 chars, string      (TAIL: `}` + text + delimiter)

Deno.test({ name: "wasm-lexical: an interpolated literal's parts are string-classed, its hole is not", ignore }, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  for (const [what, src] of [
    ["template", "const x = 1\nconst s = `v=\\{x} ok`\n"],
    ["plain string", 'const x = 1\nconst s = "v=\\{x} ok"\n'],
  ] as const) {
    const lexical = checker.lexicalTokensAt(src);
    const toks = decode(semanticTokensDataFromWasm([], lexical, [], src));
    const at = (line: number, char: number) =>
      toks.find((t) => t.line === line && t.char === char);

    const head = at(1, 10);
    if (head === undefined || head.type !== "string" || head.length !== 5) {
      throw new Error(
        `${what}: expected a 5-char string token at 1:10, got ${JSON.stringify(head)}`,
      );
    }
    const tail = at(1, 16);
    if (tail === undefined || tail.type !== "string" || tail.length !== 5) {
      throw new Error(
        `${what}: expected a 5-char string token at 1:16, got ${JSON.stringify(tail)}`,
      );
    }
    // The hole's `x` must not be swallowed by either part: no string token starts
    // at its column, and no string token spans it.
    const holeString = toks.find((t) =>
      t.type === "string" && t.line === 1 && t.char <= 15 && t.char + t.length > 15
    );
    if (holeString !== undefined) {
      throw new Error(
        `${what}: the hole must not be string-classed, got ${JSON.stringify(holeString)}`,
      );
    }
  }

  // A hole-less template is one token covering the whole literal.
  const plain = checker.lexicalTokensAt("const p = `abc`\n");
  const plainToks = decode(semanticTokensDataFromWasm([], plain, [], "const p = `abc`\n"));
  const whole = plainToks.find((t) => t.line === 0 && t.char === 10);
  if (whole === undefined || whole.type !== "string" || whole.length !== 5) {
    throw new Error(`expected a 5-char string token at 0:10, got ${JSON.stringify(whole)}`);
  }

  // A hole-LESS `"` string still carries NO class — it is one `STRING` token and
  // the TextMate grammar's, whose finer escape scopes would be lost to a flat
  // semantic token. Only a holed one splits, and only a split one is coloured
  // here; that asymmetry is deliberate and this is where it is pinned.
  const dq = checker.lexicalTokensAt('const q = "abc"\n');
  const dqToks = decode(semanticTokensDataFromWasm([], dq, [], 'const q = "abc"\n'));
  if (dqToks.some((t) => t.type === "string")) {
    throw new Error(`a "" string must stay unclassed, got ${JSON.stringify(dqToks)}`);
  }
});

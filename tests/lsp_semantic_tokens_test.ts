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

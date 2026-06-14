// Proves the self-hosted front end carries faithful SOURCE SPANS: every AST node's
// `[start, stop)` char range slices back out of the source as the exact construct
// text. This is the executable proof of the front-end-fidelity foundation the
// formatter port needs — `start` is the node's `pos` field (set at parse entry),
// `stop` is `nodeEndOf(ix)` (derived from the `nodeToks` last-token anchor).
//
// REAL MODULES: the driver imports `tokenize` from `./lexer`, `P`/`i32ToStr`/
// `nodeEndOf` + the narrowed `Node` variants from `./ast`, and `parseProgram` from
// `./parser`. A raw SOURCE STRING is lexed, its tokens bridged into the parser's
// `P.toks` (carrying the real `start` offset), parsed, then each top-level
// statement (and each `let` initializer) is sliced out of the source by its span
// and printed — the test asserts the slices reconstruct the original text.
//
// VL has no common-field read across union variants (`node.pos` off a bare `Node`
// fails to typecheck), so the driver `is`-narrows each node before reading `.pos`;
// `nodeEndOf` is a plain index→offset lookup that needs no narrowing.

import { runWasm } from "../compiler/compile.ts";
import { compileProgramCached } from "./_selfhost_cache.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const LEXER = compilerUrl("lexer.vl");
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const DRIVER = compilerUrl("__spans_driver__.vl");

// A program exercising span fidelity across leaves and nested expressions: a
// binary tree (`1 + 2 * 3`), a call (`foo(a, 7)`), a string literal, a multi-token
// function declaration (closing `}` is the span end), and a bare expression
// statement. Each `let`'s initializer span is checked too, proving NESTED nodes
// (not just statements) carry exact ranges.
const SOURCE = "let a = 1 + 2 * 3\n" +
  "let b = foo(a, 7)\n" +
  'let c = "hi"\n' +
  "function inc(n: i32): i32 { return n + 1 }\n" +
  "inc(b)\n";

// The driver: bridge the lexer's tokens into `P.toks` (keeping the real `start`
// offset), parse, walk `Program.progStmts`, and slice each construct out of the
// source by `[pos, nodeEndOf)`. `exprStart` narrows the initializer-expression
// kinds this source uses to read their `pos` (the start side of the span).
const driverHeader = `
import { tokenize } from "./lexer"
import { P, nodeEndOf, Program, LetDecl, FuncDecl, Call, BinExpr, StrLit, NumLit, Ident } from "./ast"
import { parseProgram } from "./parser"

function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
    i = i + 1
  }
  P.toks.length
}

function exprStart(ix: i32): i32 {
  let e = P.nodes[ix]
  if e is BinExpr { return e.pos }
  if e is Call { return e.pos }
  if e is StrLit { return e.pos }
  if e is NumLit { return e.pos }
  if e is Ident { return e.pos }
  0 - 1
}

function runSpans(src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  loadToks(src)
  let progIx = parseProgram()
  let pn = P.nodes[progIx]
  if pn is Program {
    let stmts = pn.progStmts
    let i = 0
    while i < stmts.length {
      let six = stmts[i]
      let s = P.nodes[six]
      if s is LetDecl {
        print("stmt " + src.slice(s.pos, nodeEndOf(six)))
        let ix = s.letInit
        print("init " + src.slice(exprStart(ix), nodeEndOf(ix)))
      } else if s is FuncDecl {
        print("stmt " + src.slice(s.pos, nodeEndOf(six)))
      } else if s is Call {
        print("stmt " + src.slice(s.pos, nodeEndOf(six)))
      }
      i = i + 1
    }
  }
  0
}
`;

let allLogs: Promise<string[]> | undefined;
const runAll = (): Promise<string[]> =>
  allLogs ??= (async () => {
    const driverBody = `runSpans(${JSON.stringify(SOURCE)})\n`;
    const sources: Record<string, string> = {
      [DRIVER]: driverHeader + driverBody,
      [LEXER]: Deno.readTextFileSync(LEXER),
      [AST]: Deno.readTextFileSync(AST),
      [PARSER]: Deno.readTextFileSync(PARSER),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted spans driver failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    return logs;
  })();

Deno.test("self-hosted spans: [start, stop) slices reconstruct each construct", async () => {
  assertEquals(await runAll(), [
    "stmt let a = 1 + 2 * 3",
    "init 1 + 2 * 3",
    "stmt let b = foo(a, 7)",
    "init foo(a, 7)",
    'stmt let c = "hi"',
    'init "hi"',
    "stmt function inc(n: i32): i32 { return n + 1 }",
    "stmt inc(b)",
  ]);
});

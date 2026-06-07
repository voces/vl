// Runs the WHOLE VL-in-VL front end end to end through the real VL toolchain: a raw
// VL SOURCE STRING is fed to the real lexer (`compiler/lexer.vl`), whose tokens
// drive the real parser (`compiler/parser.vl`) building the `compiler/ast.vl` arena
// AST, which the real type-checker (`compiler/typecheck.vl`) then walks — and the
// resulting diagnostics are asserted.
//
// This is the proof the front end self-hosts from SOURCE TEXT, not from a hand-built
// token stream. The earlier self-host harnesses (`selfhost_typecheck_test.ts`)
// HAND-BUILD their `P.toks` with a `tok(kind, text)` helper; here the genuine lexer
// produces the tokens, so a real `lexer.vl → parser.vl → typecheck.vl` pipeline runs.
//
// VL has no module system yet, so the sources are concatenated ahead of a `.vl`
// print-driver, compiled to wasm, and run; the captured log is diffed against the
// expected diagnostics. One reconciliation is needed because the lexer and parser
// were ported separately:
//   1. NAME collisions — `lexer.vl` and `ast.vl`/`parser.vl` each define `Tok`,
//      `Diag`, and `advance`. We rename the lexer's three colliding symbols in its
//      SOURCE TEXT before concatenation (glue only — no `.vl` compiler file edited).
// The token-`kind` spellings now agree between the lexer and parser (gap #2
// resolved in `compiler/lexer.vl`), so no `mapKind` translation is needed.
//
// PERF (compile-once): every case compiles the SAME ~3k-line base (lexer + ast +
// parser + typecheck); only the driven source differs. Rather than recompile the
// base once per sub-test (N full pipeline compiles, the dominant CI cost), we build
// ONE module whose driver runs every case in turn — resetting the parser/checker
// state between them — and prints label-prefixed output. One compile + one run, the
// logs are split per label, and each `Deno.test` asserts its slice. Same coverage
// (the real lexer→parser→typecheck runs on every case, and binaryen `optimize()`
// still runs — once), a fraction of the time.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// The lexer, with its three names that collide with `ast.vl`/`parser.vl` renamed in
// the SOURCE TEXT (the parser only sees `tokenize`/`LexResult`, never these). Pure
// glue: the on-disk `lexer.vl` is untouched, so the lexer self-host test still uses
// the unmodified source. `\b…\b` keeps `Tok` from matching `tokens`/`toks` and
// `Diag` from matching `diags`/`gDiags`; `advance` is its own word everywhere.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");

const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");

// Each case: a label, the VL SOURCE TEXT to drive through lexer→parser→typecheck,
// and the expected diagnostic lines (count line first, then each message in order).
type Case = { label: string; src: string; expected: string[] };

const CASES: Case[] = [
  {
    // Mirrors `tests/selfhost/pipeline_harness.vl`: a well-typed program — a
    // function decl with typed params + return, an inferred `let`, a call, a
    // comparison yielding bool, an annotated string binding, and an `if`.
    label: "well-typed",
    src: "function add(a: i32, b: i32): i32 {\n" +
      "  let sum = a + b\n" +
      "  return sum\n" +
      "}\n" +
      "let r: i32 = add(1, 2)\n" +
      "let ok: bool = r >= 2\n" +
      "if ok {\n" +
      '  let msg: string = "hi"\n' +
      "}\n",
    expected: ["diags: 0"],
  },
  {
    label: "let-mismatch",
    src: 'let x: i32 = "s"\n',
    expected: ["diags: 1", "cannot assign string to 'x' of type i32"],
  },
  {
    label: "call-errors",
    src: "function f(a: i32): i32 { return a }\n" +
      'f("hi")\n' + // wrong arg type
      "f(1, 2)\n" + // wrong arity
      "g(1)\n", // undeclared callee
    expected: [
      "diags: 3",
      "argument 1: expected i32, got string",
      "wrong number of arguments: expected 1, got 2",
      "undeclared identifier 'g'",
    ],
  },
  {
    label: "non-bool-if",
    src: "let n: i32 = 0\nif n { }\n",
    expected: ["diags: 1", "if-condition must be bool, got i32"],
  },
  {
    label: "mixed-numeric",
    src: "let a: i32 = 1\nlet b: f64 = 2.0\nlet c: i32 = a + b\n",
    expected: ["diags: 1", "operator '+' mixes i32 and f64"],
  },
];

// The combined driver: shared glue + a per-case runner that RESETS the parser arena
// (`P`) and the checker (`initChecker`) before each case, then prints each output
// line prefixed with `<label>\t` so the host can split them. `checkProgram` is always
// consumed in an expression (`i32ToStr(checkProgram(...))`) — calling it bare trips a
// codegen gap at module scale (see the gap note in `compiler/typecheck.vl`).
const driver = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function runCase(label: string, src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  loadToks(src)
  initChecker()
  print(label + "\\tdiags: " + i32ToStr(checkProgram(parseProgram())))
  let i = 0
  while i < T.diags.length {
    print(label + "\\t" + T.diags[i].tmsg)
    i = i + 1
  }
  0
}
` +
  CASES.map((c) => `runCase(${JSON.stringify(c.label)}, ${JSON.stringify(c.src)})`)
    .join("\n") + "\n";

// Compile + run the combined module ONCE (memoized), returning the per-label logs.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" +
      driver;
    const { wasm, diagnostics } = await compileCached(source);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted pipeline failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byLabel = new Map<string, string[]>();
    for (const line of logs) {
      const tab = line.indexOf("\t");
      const label = tab < 0 ? "" : line.slice(0, tab);
      const payload = tab < 0 ? line : line.slice(tab + 1);
      const arr = byLabel.get(label) ?? [];
      arr.push(payload);
      byLabel.set(label, arr);
    }
    return byLabel;
  })();

for (const c of CASES) {
  Deno.test(`self-hosted pipeline: ${c.label}`, async () => {
    const logs = (await runAll()).get(c.label) ?? [];
    assertEquals(logs, c.expected);
  });
}

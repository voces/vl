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
// REAL MODULES (H0): the four `.vl` front-end files `export` their public surface and
// `import` cross-module references, so this harness drives them through the module
// graph driver (`compileProgram`) instead of string-concatenating the sources. The old
// glue — a regex rename of the lexer's `Tok`/`Diag`/`advance` (which collided with
// `ast.vl`'s under concatenation) plus dependency-ordered concatenation — is GONE: per-
// module name isolation means the lexer's private `Tok`/`Diag`/`advance` no longer
// collide with `ast.vl`'s, and `import`/`export` wire the pieces together. The on-disk
// `compiler/*.vl` files are the real modules (no per-test source munging). An in-memory
// DRIVER module is the graph entry point: it `import`s `tokenize` from `./lexer`, `P`/
// `i32ToStr` from `./ast`, `parseProgram` from `./parser`, and `checkProgram`/
// `initChecker`/`T` from `./typecheck`.
//
// PERF (compile-once): every case drives the SAME ~3k-line module graph; only the
// source text differs. Rather than recompile the graph once per sub-test (N full
// pipeline compiles, the dominant CI cost), the driver module runs every case in turn
// — resetting the parser arena (`P`) and the checker (`initChecker`) between them — and
// prints label-prefixed output. One compile + one run, the logs are split per label,
// and each `Deno.test` asserts its slice. Same coverage (the real lexer→parser→
// typecheck runs on every case, and binaryen `optimize()` still runs — once), a
// fraction of the time.

import { compileProgram, runWasm } from "../compiler/compile.ts";
import { createOptimizeCache } from "../compiler/buildCache.ts";

// Reuse binaryen's `optimize()` output across runs for any module whose pre-optimize
// bytes are unchanged (optimize is ~40% of a compile). The graph driver path takes
// the same optimize cache the single-string self-host tests use; whole-compile
// caching does not apply here (that tier is keyed on a single source string).
const optimizeCache = createOptimizeCache();

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// Resolved keys for the on-disk front-end modules (the resolver appends `.vl` to a
// relative specifier, so a `./lexer` import resolves to this `…/lexer.vl` key).
const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const LEXER = compilerUrl("lexer.vl");
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const TYPECHECK = compilerUrl("typecheck.vl");

// The synthetic entry: the driver module. It is the only in-memory module; its
// `./lexer`/`./ast`/`./parser`/`./typecheck` specifiers resolve to the real on-disk
// `compiler/*.vl` files (siblings of this key).
const DRIVER = compilerUrl("__pipeline_driver__.vl");

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

// The driver module body opens with the import header — the public surface the
// pipeline drives — then a per-case runner. `loadToks` feeds the real lexer's tokens
// into the parser's `P.toks` (the `ast.vl` `Tok = {kind, text, pos}` model; the parser
// reads `kind`/`text` and uses `pos` as the cursor index). `runCase` RESETS the parser
// arena (`P`) and the checker (`initChecker`) before each case, then prints each output
// line prefixed with `<label>\t` so the host can split them. `checkProgram` is ALWAYS
// consumed in an expression (`i32ToStr(checkProgram(...))`) — calling it bare trips a
// codegen gap at module scale (see the gap note in `compiler/typecheck.vl`). The kind
// spellings already agree between the lexer and parser, so no `mapKind` is needed.
const driverHeader = `
import { tokenize } from "./lexer"
import { P, i32ToStr } from "./ast"
import { parseProgram } from "./parser"
import { checkProgram, initChecker, T } from "./typecheck"

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
`;

// Compile + run the driver module ONCE (memoized), returning the per-label logs. The
// driver imports resolve to the on-disk `compiler/*.vl` siblings; only the driver is
// in memory. Its tail invokes `runCase` for every case in turn.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const driverBody = CASES.map((c) =>
      `runCase(${JSON.stringify(c.label)}, ${JSON.stringify(c.src)})`
    ).join("\n") + "\n";
    const sources: Record<string, string> = {
      [DRIVER]: driverHeader + driverBody,
      [LEXER]: Deno.readTextFileSync(LEXER),
      [AST]: Deno.readTextFileSync(AST),
      [PARSER]: Deno.readTextFileSync(PARSER),
      [TYPECHECK]: Deno.readTextFileSync(TYPECHECK),
    };
    const read = (key: string): string | undefined => sources[key];
    const { wasm, diagnostics } = await compileProgram(DRIVER, read, DRIVER, {
      optimizeCache: await optimizeCache,
    });
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

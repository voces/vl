// Runs the VL-in-VL type-checker (`compiler/typecheck.vl`, over the `compiler/ast.vl`
// node arena built by `compiler/parser.vl`) through the real VL toolchain and checks
// the diagnostics it produces. VL has no module system yet, so the sources are
// concatenated ahead of a `.vl` print-driver, compiled to wasm, and run; the captured
// log is diffed against the expected diagnostics.
//
// This is the proof the self-hosted type-checker actually compiles and runs end to
// end: it consumes the REAL parser's arena AST (a genuine parser → typecheck
// pipeline, not a hand-built AST) and reports the expected errors.
//
// The checker covers: a type ARENA (i32/f64/bool/string/void primitives, plus
// Object / Function / Union / Nullable encoded by arena index); a Map-based scope
// chain with nesting/shadowing; variable decls with inference; function decls; calls
// (arity + arg/param compatibility); binary numeric ops and comparisons; if/return;
// member access on objects; and structural assignability.
//
// PERF (compile-once): the inline seeded-error cases all compile the SAME base
// (ast + parser + typecheck) and differ only in their hand-built token stream — so
// recompiling the base once per case was the dominant cost (and is NOT cacheable for
// compiler-change PRs, which change the very code under test). They are batched into
// ONE module whose driver runs each case in turn, resetting the parser arena (`P`)
// and checker (`initChecker`) between them and printing label-prefixed output; the
// host splits the logs per label. Same coverage (real parser→typecheck on every
// case; binaryen optimize() still runs, once). The well-typed case keeps its own
// compile because its `tests/selfhost/typecheck_harness.vl` fixture carries its own
// (colliding) `tok`/`report` glue.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");
const base = ast + "\n" + parser + "\n" + typecheck + "\n";

// --- the well-typed fixture: its own compile (self-contained glue) ----------
let wellTyped: Promise<string[]> | undefined;
const runWellTyped = (): Promise<string[]> =>
  wellTyped ??= (async () => {
    const { wasm, diagnostics } = await compileCached(
      base + read("./selfhost/typecheck_harness.vl"),
    );
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted typecheck (well-typed) failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    return (await runWasm(wasm)).logs;
  })();

Deno.test("self-hosted typecheck: a well-typed program reports no diagnostics", async () => {
  // Runs the shared `tests/selfhost/typecheck_harness.vl` fixture: a function decl
  // with typed params + return, an inferred `let`, a call (arity + arg types), a
  // comparison yielding bool, an annotated string binding, and an `if`.
  assertEquals(await runWellTyped(), ["diags: 0"]);
});

// --- the seeded-error cases: one shared compile -----------------------------
// Each case is a `body` of hand-built `tok(kind, text)` calls (and, for the member-
// access case, a seeded binding) run after a fresh `initChecker()`. `checkProgram` is
// always consumed in an expression (`i32ToStr(checkProgram(...))`) — calling it bare
// trips a codegen gap at module scale (see the gap note in `compiler/typecheck.vl`).
type Case = { label: string; body: string; expected: string[] };

const CASES: Case[] = [
  {
    label: "let-mismatch",
    // let x: i32 = "s"
    body: `
tok("LET", "let") tok("IDENT", "x") tok("COLON", ":") tok("IDENT", "i32")
tok("EQUAL", "=") tok("STRING", "\\"s\\"") tok("NEWLINE", "\\n") tok("EOF", "")`,
    expected: ["diags: 1", "cannot assign string to 'x' of type i32"],
  },
  {
    label: "call-errors",
    // function f(a: i32): i32 { return a }
    // f("hi")  -- wrong arg type ; f(1, 2)  -- wrong arity ; g(1)  -- undeclared
    body: `
tok("FUNCTION","function") tok("IDENT","f") tok("LPAREN","(")
tok("IDENT","a") tok("COLON",":") tok("IDENT","i32") tok("RPAREN",")")
tok("COLON",":") tok("IDENT","i32") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("RETURN","return") tok("IDENT","a") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n")
tok("IDENT","f") tok("LPAREN","(") tok("STRING","\\"hi\\"") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("IDENT","f") tok("LPAREN","(") tok("NUMBER","1") tok("COMMA",",") tok("NUMBER","2") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("IDENT","g") tok("LPAREN","(") tok("NUMBER","1") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("EOF","")`,
    expected: [
      "diags: 3",
      "argument 1: expected i32, got string",
      "wrong number of arguments: expected 1, got 2",
      "undeclared identifier 'g'",
    ],
  },
  {
    label: "non-bool-if",
    // let n: i32 = 0 ; if n { }
    body: `
tok("LET","let") tok("IDENT","n") tok("COLON",":") tok("IDENT","i32")
tok("EQUAL","=") tok("NUMBER","0") tok("NEWLINE","\\n")
tok("IF","if") tok("IDENT","n") tok("LBRACE","{") tok("RBRACE","}") tok("NEWLINE","\\n")
tok("EOF","")`,
    expected: ["diags: 1", "if-condition must be bool, got i32"],
  },
  {
    label: "return-mismatch",
    // function f(): i32 { return "x" }
    body: `
tok("FUNCTION","function") tok("IDENT","f") tok("LPAREN","(") tok("RPAREN",")")
tok("COLON",":") tok("IDENT","i32") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("RETURN","return") tok("STRING","\\"x\\"") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n") tok("EOF","")`,
    expected: ["diags: 1", "return type mismatch: expected i32, got string"],
  },
  {
    label: "mixed-numeric",
    // let a: i32 = 1 ; let b: f64 = 2.0 ; let c: i32 = a + b
    body: `
tok("LET","let") tok("IDENT","a") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","b") tok("COLON",":") tok("IDENT","f64") tok("EQUAL","=") tok("NUMBER","2.0") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","c") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","a") tok("PLUS","+") tok("IDENT","b") tok("NEWLINE","\\n")
tok("EOF","")`,
    // `a + b` mixes i32/f64 (reports once, yields the error type); the error type is
    // assignable to `c: i32`, so the assignment does NOT cascade a second diagnostic.
    expected: ["diags: 1", "operator '+' mixes i32 and f64"],
  },
  {
    label: "member-access",
    // Seed `p : {x: i32, y: i32}` (no object-type syntax in the parser subset), then
    // check `p.x + 1` (ok) and `p.z` (no such field). The `declare` runs after
    // `initChecker` (which the per-case runner calls first).
    body: `
tok("IDENT","p") tok("DOT",".") tok("IDENT","x") tok("PLUS","+") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("IDENT","p") tok("DOT",".") tok("IDENT","z") tok("NEWLINE","\\n")
tok("EOF","")
let names: string[] = ["x", "y"]
let ftys: i32[] = [TY_I32, TY_I32]
declare("p", mkObjTy(names, ftys))`,
    expected: ["diags: 1", "no field 'z' on {x: i32, y: i32}"],
  },
  {
    label: "shadowing",
    // let x: i32 = 1 ; if x >= 0 { let x: string = "s"; let y: i32 = x } ; let z: i32 = x
    body: `
tok("LET","let") tok("IDENT","x") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("IF","if") tok("IDENT","x") tok("GE",">=") tok("NUMBER","0") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","x") tok("COLON",":") tok("IDENT","string") tok("EQUAL","=") tok("STRING","\\"s\\"") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","y") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","x") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","z") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","x") tok("NEWLINE","\\n")
tok("EOF","")`,
    expected: ["diags: 1", "cannot assign string to 'y' of type i32"],
  },
];

// Shared glue + a per-case block (reset → initChecker → body → labeled report),
// concatenated into one module run at instantiation.
const driver = `
function tok(kind: string, text: string): i32 {
  P.toks.push({ kind: kind, text: text, pos: P.toks.length })
  P.toks.length - 1
}
function reportLabeled(label: string): i32 {
  print(label + "\\tdiags: " + i32ToStr(checkProgram(parseProgram())))
  let i = 0
  while i < T.diags.length {
    print(label + "\\t" + T.diags[i].tmsg)
    i = i + 1
  }
  0
}
` +
  CASES.map((c) =>
    `
P.toks = []
P.nodes = []
P.diags = []
P.pos = 0
initChecker()
${c.body}
reportLabeled(${JSON.stringify(c.label)})`
  ).join("\n") + "\n";

let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const { wasm, diagnostics } = await compileCached(base + driver);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted typecheck failed to compile: " +
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
  Deno.test(`self-hosted typecheck: ${c.label}`, async () => {
    assertEquals((await runAll()).get(c.label) ?? [], c.expected);
  });
}

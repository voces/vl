// Runs the VL-in-VL type-checker (`compiler/typecheck.vl`, over the `compiler/ast.vl`
// node arena built by `compiler/parser.vl`) through the real VL toolchain and checks
// the diagnostics it produces.
//
// This is the proof the self-hosted type-checker actually compiles and runs end to
// end: it consumes the REAL parser's arena AST (a genuine parser → typecheck
// pipeline, not a hand-built AST) and reports the expected errors.
//
// REAL MODULES: the `.vl` front-end files `export` their public surface and `import`
// cross-module references, so this harness drives them through the module graph driver
// (`compileProgram`) instead of string-concatenating the sources. The old glue —
// dependency-ordered concatenation of `ast.vl ++ parser.vl ++ typecheck.vl ++ driver`
// — is GONE. An in-memory DRIVER module is the graph entry point: it `import`s
// `P`/`i32ToStr` from `./ast`, `parseProgram` from `./parser`, and `checkProgram`/
// `initChecker`/`T` (plus `declare`/`mkObjTy`/`TY_I32`, which the member-access case
// uses to seed a struct-typed binding through the checker API) from `./typecheck`.
//
// The checker covers: a type ARENA (i32/f64/bool/string/void primitives, plus
// Object / Function / Union / Nullable encoded by arena index); a Map-based scope
// chain with nesting/shadowing; variable decls with inference; function decls; calls
// (arity + arg/param compatibility); binary numeric ops and comparisons; if/return;
// member access on objects; and structural assignability.
//
// PERF (compile-once): the cases all compile the SAME module graph and differ only in
// their hand-built token stream — so recompiling the graph once per case was the
// dominant cost (and is NOT cacheable for compiler-change PRs, which change the very
// code under test). They are batched into ONE compile whose driver runs each case in
// turn, resetting the parser arena (`P`) and checker (`initChecker`) between them and
// printing label-prefixed output; the host splits the logs per label. The well-typed
// case folds in too: its token-builder (`buildWellTyped`) is lifted verbatim from
// `tests/selfhost/typecheck_harness.vl` (already valid VL source) into the driver, so
// it shares the single compile rather than paying its own.

import { runWasm } from "../compiler/compile.ts";
import { compileProgramCached } from "./_selfhost_cache.ts";


const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// Resolved keys for the on-disk front-end modules (the resolver appends `.vl` to a
// relative specifier, so a `./ast` import resolves to this `…/ast.vl` key).
const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const TYPECHECK = compilerUrl("typecheck.vl");

// The synthetic entry: the driver module. Its `./ast`/`./parser`/`./typecheck`
// specifiers resolve to the real on-disk `compiler/*.vl` siblings.
const DRIVER = compilerUrl("__typecheck_driver__.vl");

// The well-typed fixture's token-builder (`buildWellTyped`), lifted VERBATIM from
// `tests/selfhost/typecheck_harness.vl` — it is already valid VL source, so no
// re-escaping is needed — and injected into the shared driver so the well-typed case
// folds into the one batched compile. (The fixture file still stands alone; we reuse
// only its token-builder here.)
const harness = read("./selfhost/typecheck_harness.vl");
const buildWellTypedStart = harness.indexOf("function buildWellTyped");
const buildWellTyped = harness.slice(
  buildWellTypedStart,
  harness.indexOf("\n}\n", buildWellTypedStart) + 2,
);

// --- all cases: one shared compile ------------------------------------------
// Each case is a `body` of hand-built `tok(kind, text)` calls (and, for the member-
// access case, a seeded binding) run after a fresh `initChecker()`. `checkProgram` is
// always consumed in an expression (`i32ToStr(checkProgram(...))`) — calling it bare
// trips a codegen gap at module scale (see the gap note in `compiler/typecheck.vl`).
type Case = { label: string; body: string; expected: string[] };

const CASES: Case[] = [
  {
    label: "well-typed",
    // The fixture's representative well-typed program (function decl + typed
    // params/return, inferred `let`, call, comparison, annotated string, `if`).
    body: "buildWellTyped()",
    expected: ["diags: 0"],
  },
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
    // `a + b` now WIDENS the i32 to f64 (B2 numeric-widening lattice) and yields f64;
    // the f64 result then flows into the `c: i32` slot, which is a LOSSY narrowing and
    // is rejected — a single diagnostic on the assignment (no error on `a + b` itself).
    expected: [
      "diags: 1",
      "f64 doesn't fit in i32 — the conversion is lossy and must be made explicit (narrowing truncates the value)",
    ],
  },
  {
    label: "member-access",
    // Seed `p : {x: i32, y: i32}` through the checker API (`declare`/`mkObjTy`/`TY_I32`
    // — there is no object-type syntax in the parsed subset), then check `p.x + 1` (ok)
    // and `p.z` (no such field). The seeding runs after the tokens are built and before
    // `checkProgram` (which `reportLabeled` calls).
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

// The driver module body: the import header, the shared `tok` helper, the lifted
// `buildWellTyped`, `reportLabeled`, then a per-case block (reset → initChecker →
// body → labeled report). All of it runs in ONE compiled module.
const driverHeader = `
import { P, i32ToStr } from "./ast"
import { parseProgram } from "./parser"
import { checkProgram, declare, initChecker, mkObjTy, T, TY_I32 } from "./typecheck"

function tok(kind: string, text: string): i32 {
  P.toks.push({ kind: kind, text: text, pos: P.toks.length, start: 0, line: 1, col: 0 })
  P.toks.length - 1
}
${buildWellTyped}
function reportLabeled(label: string): i32 {
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
// driver's imports resolve to the on-disk `compiler/*.vl` siblings; only the driver is
// in memory. Its tail runs every case in turn.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const driverBody = CASES.map((c) => `
P.toks = []
P.nodes = []
P.diags = []
P.pos = 0
initChecker()
${c.body}
reportLabeled(${JSON.stringify(c.label)})`).join("\n") + "\n";
    const sources: Record<string, string> = {
      [DRIVER]: driverHeader + driverBody,
      [AST]: Deno.readTextFileSync(AST),
      [PARSER]: Deno.readTextFileSync(PARSER),
      [TYPECHECK]: Deno.readTextFileSync(TYPECHECK),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
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

// Runs the VL-in-VL type-checker (`compiler/typecheck.vl`, over the `compiler/ast.vl`
// node arena built by `compiler/parser.vl`) through the real VL toolchain and checks
// the diagnostics it produces. VL has no module system yet, so the sources are
// concatenated ahead of a `.vl` print-driver, compiled to wasm, and run; the captured
// log is diffed against the expected diagnostics.
//
// This is the proof the self-hosted type-checker actually compiles and runs end to
// end: it consumes the REAL parser's arena AST (a genuine parser → typecheck
// pipeline, not a hand-built AST) and reports the expected errors. It is the next
// self-hosting stage after the lexer (#63) and parser (#70) re-lands.
//
// The checker covers: a type ARENA (i32/f64/bool/string/void primitives, plus
// Object / Function / Union / Nullable encoded by arena index — recursive type
// unions aren't expressible as a VL alias, so types use the same arena trick the AST
// uses for nodes); a Map-based scope chain with nesting/shadowing; variable decls
// with inference from the initializer; function decls (param + return types); calls
// (arity + arg/param compatibility); binary numeric ops and comparisons; if/return;
// member access on objects; and structural assignability.

import { compile, runWasm } from "../compiler/compile.ts";

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

// Compile `ast.vl ++ parser.vl ++ typecheck.vl ++ driver`, run it, return the logs.
const runDriver = async (driver: string): Promise<string[]> => {
  const source = ast + "\n" + parser + "\n" + typecheck + "\n" + driver;
  // `optimize: false`: this test only runs the module and diffs its printed
  // diagnostics, which binaryen's optimize() pass cannot change. Skipping it
  // roughly halves the per-sub-test compile time on this large self-host module.
  const { wasm, diagnostics } = await compile(source, "source.vl", {
    optimize: false,
  });
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted typecheck failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

// A `tok` helper + a token-stream prelude shared by the inline drivers. Each driver
// appends tokens, parses, then checks. `checkProgram` is ALWAYS consumed in an
// expression (`i32ToStr(checkProgram(...))`) — calling it as a bare statement trips
// a codegen gap at module scale (see the gap note in `compiler/typecheck.vl`).
const prelude = `
function tok(kind: string, text: string): i32 {
  P.toks.push({ kind: kind, text: text, pos: P.toks.length })
  P.toks.length - 1
}
function report(): i32 {
  print("diags: " + i32ToStr(checkProgram(parseProgram())))
  let i = 0
  while i < T.diags.length {
    print(T.diags[i].tmsg)
    i = i + 1
  }
  0
}
`;

Deno.test("self-hosted typecheck: a well-typed program reports no diagnostics", async () => {
  // Runs the shared `tests/selfhost/typecheck_harness.vl` fixture: a function decl
  // with typed params + return, an inferred `let`, a call (arity + arg types), a
  // comparison yielding bool, an annotated string binding, and an `if`.
  const logs = await runDriver(read("./selfhost/typecheck_harness.vl"));
  assertEquals(logs, ["diags: 0"]);
});

Deno.test("self-hosted typecheck: a let-annotation mismatch is reported", async () => {
  // let x: i32 = "s"
  const driver = prelude + `
tok("LET", "let") tok("IDENT", "x") tok("COLON", ":") tok("IDENT", "i32")
tok("EQUAL", "=") tok("STRING", "\\"s\\"") tok("NEWLINE", "\\n") tok("EOF", "")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 1",
    "cannot assign string to 'x' of type i32",
  ]);
});

Deno.test("self-hosted typecheck: call arity, arg-type, and undeclared errors", async () => {
  // function f(a: i32): i32 { return a }
  // f("hi")     -- wrong arg type
  // f(1, 2)     -- wrong arity
  // g(1)        -- undeclared callee
  const driver = prelude + `
tok("FUNCTION","function") tok("IDENT","f") tok("LPAREN","(")
tok("IDENT","a") tok("COLON",":") tok("IDENT","i32") tok("RPAREN",")")
tok("COLON",":") tok("IDENT","i32") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("RETURN","return") tok("IDENT","a") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n")
tok("IDENT","f") tok("LPAREN","(") tok("STRING","\\"hi\\"") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("IDENT","f") tok("LPAREN","(") tok("NUMBER","1") tok("COMMA",",") tok("NUMBER","2") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("IDENT","g") tok("LPAREN","(") tok("NUMBER","1") tok("RPAREN",")") tok("NEWLINE","\\n")
tok("EOF","")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 3",
    "argument 1: expected i32, got string",
    "wrong number of arguments: expected 1, got 2",
    "undeclared identifier 'g'",
  ]);
});

Deno.test("self-hosted typecheck: a non-bool if-condition is reported", async () => {
  // let n: i32 = 0
  // if n { }     -- condition is i32, not bool
  const driver = prelude + `
tok("LET","let") tok("IDENT","n") tok("COLON",":") tok("IDENT","i32")
tok("EQUAL","=") tok("NUMBER","0") tok("NEWLINE","\\n")
tok("IF","if") tok("IDENT","n") tok("LBRACE","{") tok("RBRACE","}") tok("NEWLINE","\\n")
tok("EOF","")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 1",
    "if-condition must be bool, got i32",
  ]);
});

Deno.test("self-hosted typecheck: a return-type mismatch is reported", async () => {
  // function f(): i32 { return "x" }
  const driver = prelude + `
tok("FUNCTION","function") tok("IDENT","f") tok("LPAREN","(") tok("RPAREN",")")
tok("COLON",":") tok("IDENT","i32") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("RETURN","return") tok("STRING","\\"x\\"") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n") tok("EOF","")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 1",
    "return type mismatch: expected i32, got string",
  ]);
});

Deno.test("self-hosted typecheck: mixed-numeric arithmetic is reported", async () => {
  // let a: i32 = 1
  // let b: f64 = 2.0
  // let c: i32 = a + b   -- i32 + f64 (no implicit conversion) AND f64 -> i32
  const driver = prelude + `
tok("LET","let") tok("IDENT","a") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","b") tok("COLON",":") tok("IDENT","f64") tok("EQUAL","=") tok("NUMBER","2.0") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","c") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","a") tok("PLUS","+") tok("IDENT","b") tok("NEWLINE","\\n")
tok("EOF","")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  // `a + b` mixes i32/f64, so it reports once and yields the error type; the error
  // type is assignable to `c: i32` (bidirectional compat) so the assignment does
  // NOT cascade a second diagnostic — exactly the no-cascade behavior intended.
  assertEquals(logs, [
    "diags: 1",
    "operator '+' mixes i32 and f64",
  ]);
});

Deno.test("self-hosted typecheck: member access uses the structural object type (arena)", async () => {
  // Seed a binding `p : {x: i32, y: i32}` (the parser subset has no object-type
  // syntax), then check `p.x + 1` (ok) and `p.z` (no such field). Proves the type
  // ARENA round-trips: the object's field types are arena indices, and `tyToStr`
  // recurses through the arena to render `{x: i32, y: i32}` in the diagnostic.
  const driver = prelude + `
tok("IDENT","p") tok("DOT",".") tok("IDENT","x") tok("PLUS","+") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("IDENT","p") tok("DOT",".") tok("IDENT","z") tok("NEWLINE","\\n")
tok("EOF","")
initChecker()
let names: string[] = ["x", "y"]
let ftys: i32[] = [TY_I32, TY_I32]
declare("p", mkObjTy(names, ftys))
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 1",
    "no field 'z' on {x: i32, y: i32}",
  ]);
});

Deno.test("self-hosted typecheck: shadowing in a nested block scope", async () => {
  // let x: i32 = 1
  // if x >= 0 {
  //   let x: string = "s"   -- shadows the outer i32 x in the block scope
  //   let y: i32 = x        -- mismatch: inner x is string
  // }
  // let z: i32 = x          -- outer x is back in scope (i32), ok
  const driver = prelude + `
tok("LET","let") tok("IDENT","x") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("NUMBER","1") tok("NEWLINE","\\n")
tok("IF","if") tok("IDENT","x") tok("GE",">=") tok("NUMBER","0") tok("LBRACE","{") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","x") tok("COLON",":") tok("IDENT","string") tok("EQUAL","=") tok("STRING","\\"s\\"") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","y") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","x") tok("NEWLINE","\\n")
tok("RBRACE","}") tok("NEWLINE","\\n")
tok("LET","let") tok("IDENT","z") tok("COLON",":") tok("IDENT","i32") tok("EQUAL","=") tok("IDENT","x") tok("NEWLINE","\\n")
tok("EOF","")
initChecker()
report()
`;
  const logs = await runDriver(driver);
  assertEquals(logs, [
    "diags: 1",
    "cannot assign string to 'y' of type i32",
  ]);
});

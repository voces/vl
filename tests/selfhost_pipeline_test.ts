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

import { compile, runWasm } from "../compiler/compile.ts";

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

// Compile `lexer.vl ++ ast.vl ++ parser.vl ++ typecheck.vl ++ driver`, run it, and
// return the logs. (The order matters: `ast.vl` defines `P`/`Tok`/`mk*` the parser
// needs; `typecheck.vl` reads `P.nodes`; the lexer is independent and goes first.)
const runDriver = async (driver: string): Promise<string[]> => {
  const source = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" +
    driver;
  const { wasm, diagnostics } = await compile(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted pipeline failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

// The source→tokens loader + the diagnostic printer, shared by the inline
// seeded-error drivers. (The shared fixture `tests/selfhost/pipeline_harness.vl`
// carries its own copy of this glue so it also runs standalone.) `checkProgram` is
// ALWAYS consumed in an expression (`i32ToStr(checkProgram(...))`) — calling it bare
// trips a codegen gap at module scale (see the gap note in `compiler/typecheck.vl`).
// No `mapKind` needed: the lexer now uses the same kind spellings as the parser.
const prelude = `
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

// Build a driver that lexes `src`, parses, checks, and prints diagnostics.
const driverFor = (src: string): string =>
  prelude + `\nloadToks(${JSON.stringify(src)})\ninitChecker()\nreport()\n`;

Deno.test("self-hosted pipeline: a well-typed program from source reports no diagnostics", async () => {
  // Runs the shared `tests/selfhost/pipeline_harness.vl` fixture: raw source for a
  // function decl with typed params + return, an inferred `let`, a call, a
  // comparison yielding bool, an annotated string binding, and an `if` — all driven
  // through the real lexer → parser → typecheck chain.
  const logs = await runDriver(read("./selfhost/pipeline_harness.vl"));
  assertEquals(logs, ["diags: 0"]);
});

Deno.test("self-hosted pipeline: a let-annotation mismatch from source is reported", async () => {
  const logs = await runDriver(driverFor('let x: i32 = "s"\n'));
  assertEquals(logs, [
    "diags: 1",
    "cannot assign string to 'x' of type i32",
  ]);
});

Deno.test("self-hosted pipeline: call arity, arg-type, and undeclared errors from source", async () => {
  const src = "function f(a: i32): i32 { return a }\n" +
    'f("hi")\n' + // wrong arg type
    "f(1, 2)\n" + // wrong arity
    "g(1)\n"; // undeclared callee
  const logs = await runDriver(driverFor(src));
  assertEquals(logs, [
    "diags: 3",
    "argument 1: expected i32, got string",
    "wrong number of arguments: expected 1, got 2",
    "undeclared identifier 'g'",
  ]);
});

Deno.test("self-hosted pipeline: a non-bool if-condition from source is reported", async () => {
  const logs = await runDriver(driverFor("let n: i32 = 0\nif n { }\n"));
  assertEquals(logs, [
    "diags: 1",
    "if-condition must be bool, got i32",
  ]);
});

Deno.test("self-hosted pipeline: mixed-numeric arithmetic from source is reported", async () => {
  const src = "let a: i32 = 1\nlet b: f64 = 2.0\nlet c: i32 = a + b\n";
  const logs = await runDriver(driverFor(src));
  assertEquals(logs, [
    "diags: 1",
    "operator '+' mixes i32 and f64",
  ]);
});

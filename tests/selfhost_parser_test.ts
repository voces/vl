// Runs the VL-in-VL parser (`selfhost/parser.vl`, over `selfhost/ast.vl`) through
// the real VL toolchain and checks the AST it builds. VL has no module system
// yet, so the sources are concatenated ahead of a `.vl` print-driver
// (`selfhost/parser_harness.vl`, which hand-builds a token stream — the PARSER,
// not an integrated lexer pipeline — runs `parseProgram`, and prints the AST as
// an indented tree), the whole thing is compiled to wasm and run, and the
// captured log is diffed against the expected tree.
//
// This is the proof the self-hosted parser actually compiles and runs end to end.

import { compile, runWasm } from "../compiler/compile.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const ast = read("../selfhost/ast.vl");
const parser = read("../selfhost/parser.vl");

// Compile `ast.vl ++ parser.vl ++ driver`, run it, return the captured log lines.
const runDriver = async (driver: string): Promise<string[]> => {
  const source = ast + "\n" + parser + "\n" + driver;
  const { wasm, diagnostics } = await compile(source);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || !wasm) {
    throw new Error(
      "self-hosted parser failed to compile: " +
        errors.map((d) => d.message).join("; "),
    );
  }
  const { logs } = await runWasm(wasm);
  return logs;
};

Deno.test("self-hosted parser compiles, runs, and builds the AST for the sample", async () => {
  const logs = await runDriver(read("../selfhost/parser_harness.vl"));
  // The harness prints the AST as an indented tree then a node/diagnostics
  // summary. Asserting the whole tree catches any mis-parse: wrong operator
  // precedence (the `a + b * 2` shape), swapped operands, a dropped child, a
  // mis-discriminated node kind.
  const expected = [
    "program",
    "  function add",
    "    param a",
    "      type i32",
    "    param b",
    "      type i32",
    "    block",
    "      let sum",
    "        binary +",
    "          ident a",
    "          binary *",
    "            ident b",
    "            num 2",
    "      if",
    "        binary >=",
    "          ident sum",
    "          num 10",
    "        block",
    "          return",
    "            ident sum",
    "        block",
    "          return",
    "            unary -",
    "              ident sum",
    "  const ok",
    "    binary ||",
    "      call",
    "        ident add",
    "        num 1",
    "        num 2",
    "      ident flag",
    "  binary =",
    "    ident result",
    "    call",
    "      member .method",
    "        member .field",
    "          ident obj",
    "      ident x",
    "== nodes: 39 ==",
    "== diagnostics: 0 ==",
  ];
  assertEquals(logs, expected);
});

Deno.test("self-hosted parser reports a diagnostic on malformed input", async () => {
  // A driver that feeds a let-decl with a missing initializer expression and an
  // unbalanced paren, then prints the diagnostics. Kept inline (not in the sample
  // fixture) so the happy-path tree stays clean. Proves the error channel and the
  // panic-free recovery (the walk still terminates).
  const driver = `
let toks: Tok[] = []
toks.push({ kind: "LET", text: "let", pos: 0 })
toks.push({ kind: "IDENT", text: "x", pos: 1 })
toks.push({ kind: "EQUAL", text: "=", pos: 2 })
toks.push({ kind: "LPAREN", text: "(", pos: 3 })
toks.push({ kind: "NUMBER", text: "1", pos: 4 })
toks.push({ kind: "EOF", text: "", pos: 5 })
let nodes: Node[] = []
let diags: Diag[] = []
let c: Cur = { pos: 0 }
let root = parseProgram(toks, c, nodes, diags)
print("nodes: " + i32ToStr(nodes.length))
print("diags: " + i32ToStr(diags.length))
let i = 0
while i < diags.length {
  print(diags[i].msg)
  i = i + 1
}
`;
  const logs = await runDriver(driver);
  // `let x = (1` — the parenthesized expr's RPAREN is missing; the parser records
  // exactly one diagnostic and recovers (it doesn't loop or crash).
  assertEquals(logs, [
    "nodes: 4", // let, paren, num(1), program
    "diags: 1",
    "expected RPAREN but found EOF",
  ]);
});

// Runs the VL-in-VL parser (`compiler/parser.vl`, over `compiler/ast.vl`) through
// the real VL toolchain and checks the AST it builds.
//
// This is the proof the self-hosted parser compiles and runs end to end: a genuine
// discriminated-union AST (discriminated with `is`), mutually-recursive
// recursive-descent functions, and a struct-field arena pushed onto directly.
//
// REAL MODULES: `ast.vl`/`parser.vl` `export` their public surface, so this harness
// drives them through the module graph driver (`compileProgram`) instead of
// concatenating the sources. An in-memory DRIVER module imports `P`/`i32ToStr` and the
// `Node` variant types (which the fixture's tree-walkers `is`-narrow) from `./ast`, and
// `parseProgram` from `./parser`.
//
// PERF (compile-once): both cases compile the same module graph. The fixture's helper
// functions are lifted into the shared driver once; each case runs in its own function
// (resetting the parser arena `P` first) behind a `@@N` sentinel so the host can split
// the single run's log.

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

// Resolved keys for the on-disk modules + the in-memory driver (its `./ast`/`./parser`
// specifiers resolve to the real `compiler/*.vl` siblings).
const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const DRIVER = compilerUrl("__parser_driver__.vl");

// The import header the driver module opens with — wires it to the real modules. The
// fixture's tree-walkers `is`-narrow the `Node` union, so every variant is imported.
const driverHeader =
  `import { P, i32ToStr, NumLit, StrLit, CharLit, BoolLit, Ident, Unary, BinExpr, Call, Member, Paren, ErrExpr, LetDecl, Param, TypeRef, FuncDecl, IfStmt, WhileStmt, BreakStmt, ContinueStmt, RetStmt, Block, Program } from "./ast"\nimport { parseProgram } from "./parser"\n\n`;

// Split the standalone fixture into its helper DEFS (functions: tok, buildTokens,
// the AST tree-walkers) and its RUN section (build tokens → parseProgram → walk).
// The defs go into the shared driver once; the run becomes the first case body.
const harness = read("./selfhost/parser_harness.vl");
const runMarker = harness.indexOf("// ── run");
const parserDefs = harness.slice(0, runMarker);
const parserRun = harness.slice(harness.indexOf("\n", runMarker) + 1);

// Reset the parser arena between cases (`parseProgram` mutates the global `P`).
const RESET = "P.toks = []\nP.nodes = []\nP.diags = []\nP.pos = 0\n";

type Case = { name: string; body: string; expected: string[] };

const CASES: Case[] = [
  {
    name: "compiles, runs, and builds the AST for the sample",
    body: parserRun,
    expected: [
      "program",
      "  function add",
      "    param a",
      "      type i32",
      "    param b",
      "      type i32",
      "    type i32",
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
    ],
  },
  {
    name: "reports a diagnostic on malformed input",
    // `let x = (1` — the parenthesized expr's RPAREN is missing; one diagnostic,
    // and the parser recovers (no loop/crash).
    body: `
P.toks.push({ kind: "LET", text: "let", pos: 0, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "IDENT", text: "x", pos: 1, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "EQUAL", text: "=", pos: 2, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "LPAREN", text: "(", pos: 3, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "NUMBER", text: "1", pos: 4, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "EOF", text: "", pos: 5, start: 0, line: 1, col: 0 })
let _root = parseProgram()
print("nodes: " + i32ToStr(P.nodes.length))
print("diags: " + i32ToStr(P.diags.length))
let i = 0
while i < P.diags.length {
  print(P.diags[i].msg)
  i = i + 1
}
`,
    expected: [
      "nodes: 4",
      "diags: 1",
      "expected RPAREN but found EOF",
    ],
  },
  {
    // P1 — multiline function signature: `function f(` NEWLINE `a: i32,` NEWLINE
    // `b: i32` NEWLINE `)` NEWLINE `{ }`. The param-list loop must skip NEWLINEs
    // after `(`, around the `,`, and before `)`. (Mirrors host `parseParams`.)
    name: "parses a multiline function signature",
    body: `
tok("FUNCTION", "function")
tok("IDENT", "f")
tok("LPAREN", "(")
tok("NEWLINE", "\\n")
tok("IDENT", "a")
tok("COLON", ":")
tok("IDENT", "i32")
tok("COMMA", ",")
tok("NEWLINE", "\\n")
tok("IDENT", "b")
tok("COLON", ":")
tok("IDENT", "i32")
tok("NEWLINE", "\\n")
tok("RPAREN", ")")
tok("LBRACE", "{")
tok("RBRACE", "}")
tok("EOF", "")
let _root = parseProgram()
walk(_root, 0)
print("diags: " + i32ToStr(P.diags.length))
`,
    expected: [
      "program",
      "  function f",
      "    param a",
      "      type i32",
      "    param b",
      "      type i32",
      "    block",
      "diags: 0",
    ],
  },
  {
    // P3 — bare object literal as a statement: `{ k: v, j: w }` at statement
    // position must parse as an object-literal EXPRESSION (implicit return),
    // NOT a block. Multiline too: `{` NEWLINE field NEWLINE `}`.
    name: "parses a bare object literal statement (incl. multiline)",
    body: `
tok("LBRACE", "{")
tok("IDENT", "k")
tok("COLON", ":")
tok("IDENT", "v")
tok("COMMA", ",")
tok("IDENT", "j")
tok("COLON", ":")
tok("IDENT", "w")
tok("RBRACE", "}")
tok("NEWLINE", "\\n")
tok("LBRACE", "{")
tok("NEWLINE", "\\n")
tok("IDENT", "m")
tok("COLON", ":")
tok("IDENT", "n")
tok("NEWLINE", "\\n")
tok("RBRACE", "}")
tok("EOF", "")
let _root = parseProgram()
walk(_root, 0)
print("diags: " + i32ToStr(P.diags.length))
`,
    expected: [
      "program",
      "  ??",
      "  ??",
      "diags: 0",
    ],
  },
  {
    // P5 — newline before `else`: `if x { } ` NEWLINE ` else { }`. `parseIf`
    // must skip NEWLINEs before looking for `else` (only consuming them when an
    // `else` actually follows). (Mirrors host `parseIf`'s else lookahead.)
    name: "parses an if with a newline before else",
    body: `
tok("IF", "if")
tok("IDENT", "x")
tok("LBRACE", "{")
tok("RBRACE", "}")
tok("NEWLINE", "\\n")
tok("ELSE", "else")
tok("LBRACE", "{")
tok("RBRACE", "}")
tok("EOF", "")
let _root = parseProgram()
walk(_root, 0)
print("diags: " + i32ToStr(P.diags.length))
`,
    expected: [
      "program",
      "  if",
      "    ident x",
      "    block",
      "    block",
      "diags: 0",
    ],
  },
  {
    // `while x { break }` parses with NO diagnostics: the BREAK keyword is a bare
    // loop-control statement (`parseBreak` -> `mkBreak`). Five arena nodes, pushed
    // bottom-up: [0] the `x` condition ident, [1] the `break`, [2] its block, [3]
    // the while, [4] the program — so node 1 is the `BreakStmt`. Real parseProgram.
    name: "parses a bare `break` inside a while with no diagnostics",
    body: `
P.toks.push({ kind: "WHILE", text: "while", pos: 0, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "IDENT", text: "x", pos: 6, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "LBRACE", text: "{", pos: 8, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "BREAK", text: "break", pos: 10, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "RBRACE", text: "}", pos: 16, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "EOF", text: "", pos: 17, start: 0, line: 1, col: 0 })
let _root = parseProgram()
print("nodes: " + i32ToStr(P.nodes.length))
print("diags: " + i32ToStr(P.diags.length))
let stmt = P.nodes[1]
if stmt is BreakStmt { print("kind: break") }
`,
    expected: [
      "nodes: 5",
      "diags: 0",
      "kind: break",
    ],
  },
  {
    // `while x { continue }` — the symmetric `continue` parse: `parseContinue` ->
    // `mkContinue`, no diagnostics, the body statement is a `ContinueStmt`.
    name: "parses a bare `continue` inside a while with no diagnostics",
    body: `
P.toks.push({ kind: "WHILE", text: "while", pos: 0, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "IDENT", text: "x", pos: 6, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "LBRACE", text: "{", pos: 8, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "CONTINUE", text: "continue", pos: 10, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "RBRACE", text: "}", pos: 19, start: 0, line: 1, col: 0 })
P.toks.push({ kind: "EOF", text: "", pos: 20, start: 0, line: 1, col: 0 })
let _root = parseProgram()
print("nodes: " + i32ToStr(P.nodes.length))
print("diags: " + i32ToStr(P.diags.length))
let stmt = P.nodes[1]
if stmt is ContinueStmt { print("kind: continue") }
`,
    expected: [
      "nodes: 5",
      "diags: 0",
      "kind: continue",
    ],
  },
];

// One compile: fixture defs + a per-case function (reset → body) behind a `@@N`
// sentinel.
const driver = driverHeader + parserDefs + "\n" +
  CASES.map((c, i) => `function pcase${i}(): i32 {\n${RESET}${c.body}\n0\n}`)
    .join("\n") +
  "\n" +
  CASES.map((_, i) => `print("@@${i}")\npcase${i}()`).join("\n") + "\n";

let allLogs: Promise<Map<number, string[]>> | undefined;
const runAll = (): Promise<Map<number, string[]>> =>
  allLogs ??= (async () => {
    const sources: Record<string, string> = {
      [DRIVER]: driver,
      [AST]: Deno.readTextFileSync(AST),
      [PARSER]: Deno.readTextFileSync(PARSER),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted parser failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byCase = new Map<number, string[]>();
    let cur = -1;
    for (const line of logs) {
      const m = line.match(/^@@(\d+)$/);
      if (m) {
        cur = Number(m[1]);
        byCase.set(cur, []);
      } else if (cur >= 0) byCase.get(cur)!.push(line);
    }
    return byCase;
  })();

for (let i = 0; i < CASES.length; i++) {
  Deno.test(`self-hosted parser ${CASES[i].name}`, async () => {
    assertEquals((await runAll()).get(i) ?? [], CASES[i].expected);
  });
}

// Runs the VL-in-VL parser (`compiler/parser.vl`, over `compiler/ast.vl`) through
// the real VL toolchain and checks the AST it builds. VL has no module system yet,
// so the sources are concatenated ahead of a `.vl` print-driver, compiled to wasm
// and run, and the captured log is diffed against the expected tree.
//
// This is the proof the self-hosted parser compiles and runs end to end: a genuine
// discriminated-union AST (discriminated with `is`), mutually-recursive
// recursive-descent functions, and a struct-field arena pushed onto directly.
//
// PERF (compile-once): both cases compile the same `ast.vl ++ parser.vl` base. The
// fixture's helper functions are lifted into the shared driver once; each case runs
// in its own function (resetting the parser arena `P` first) behind a `@@N` sentinel
// so the host can split the single run's log.

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
P.toks.push({ kind: "LET", text: "let", pos: 0 })
P.toks.push({ kind: "IDENT", text: "x", pos: 1 })
P.toks.push({ kind: "EQUAL", text: "=", pos: 2 })
P.toks.push({ kind: "LPAREN", text: "(", pos: 3 })
P.toks.push({ kind: "NUMBER", text: "1", pos: 4 })
P.toks.push({ kind: "EOF", text: "", pos: 5 })
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
];

// One compile: fixture defs + a per-case function (reset → body) behind a `@@N`
// sentinel.
const driver = parserDefs + "\n" +
  CASES.map((c, i) => `function pcase${i}(): i32 {\n${RESET}${c.body}\n0\n}`)
    .join("\n") + "\n" +
  CASES.map((_, i) => `print("@@${i}")\npcase${i}()`).join("\n") + "\n";

let allLogs: Promise<Map<number, string[]>> | undefined;
const runAll = (): Promise<Map<number, string[]>> =>
  allLogs ??= (async () => {
    const { wasm, diagnostics } = await compileCached(
      ast + "\n" + parser + "\n" + driver,
    );
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

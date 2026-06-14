// Drives the self-hosted formatter `compiler/format.vl` over representative VL
// source snippets and asserts its output matches what the HOST `format()`
// (`compiler/format.ts`) produces — the fidelity proof for the kill-TS port.
//
// Modeled on `tests/selfhost_pipeline_test.ts`'s module-graph driver: an in-memory
// DRIVER module imports `tokenize` from `./lexer`, `P`/`i32ToStr` from `./ast`,
// `parseProgram` from `./parser`, and `formatProgram`/`fmtSetSource`/
// `fmtResetComments`/`fmtAddComment` from `./format`. For each case it lexes the
// source (feeding tokens into `P.toks` AND the formatter's comment table), parses,
// formats, and `print`s the result so the host can compare it to `format(src)`.
//
// The driver prints each output line prefixed with `<label>\t` and frames the
// formatted text between `<<<BEGIN>>>` / `<<<END>>>` markers so multi-line output
// is reassembled exactly (newlines included) on the host side.

import { runWasm } from "../compiler/compile.ts";
import { compileProgramCached } from "./_selfhost_cache.ts";
import { format } from "../compiler/format.ts";

const compilerUrl = (name: string) =>
  new URL(`../compiler/${name}`, import.meta.url).pathname;
const LEXER = compilerUrl("lexer.vl");
const AST = compilerUrl("ast.vl");
const PARSER = compilerUrl("parser.vl");
const TYPECHECK = compilerUrl("typecheck.vl");
const FORMAT = compilerUrl("format.vl");
const DRIVER = compilerUrl("__format_driver__.vl");

// Representative snippets covering the ported constructs. Each must round-trip to
// the SAME text the host formatter produces.
const CASES: { label: string; src: string }[] = [
  {
    label: "fn-decl",
    src: "export const x:i32=1\nfunction add(a: i32, b: i32): i32 {\nreturn a + b\n}\n",
  },
  {
    label: "binary-precedence",
    src: "let y = 1 + 2 * 3\nlet z = a && b || c\nlet w = (a + b) * c\n",
  },
  {
    label: "if-collapse",
    src: "let q = 1\nif q > 3 {\n  print(q)\n} else {\n  print(0)\n}\n",
  },
  {
    label: "if-block",
    src: "let q = 1\nif q > 3 {\n  print(q)\n  print(q)\n}\n",
  },
  {
    label: "type-decl",
    src: "type Point = { x: i32, y: i32 }\nlet p: Point = { x: 1, y: 2 }\n",
  },
  {
    label: "union-decl",
    src: "type Shape = Circle | Square\nfunction area(s: Shape): i32 { return 0 }\n",
  },
  {
    label: "loops",
    src: "for i in 0 to 10 {\n  print(i)\n}\nlet n = 3\nwhile n > 0 {\n  n = n - 1\n}\n",
  },
  {
    label: "for-step",
    src: "for i in 0 to 10 step 2 {\n  print(i)\n}\n",
  },
  {
    label: "comments",
    src: "// header\nlet z = 5 // trailing\nfunction f(): i32 {\n  // inner\n  return z\n}\n",
  },
  {
    label: "blank-lines",
    src: "let a = 1\n\n\n\nlet b = 2\n",
  },
  {
    label: "elseif-chain",
    src: "let n = 1\nif n == 0 {\n  print(0)\n} elseif n == 1 {\n  print(1)\n} else {\n  print(2)\n}\n",
  },
  {
    label: "access-chains",
    src: "let r = obj.field.inner\nlet s = arr[0]\nlet t = obj?.maybe\nlet u = f(g(1), h(2))\n",
  },
  {
    label: "array-literal",
    src: "let xs = [1, 2, 3]\nlet ys: i32[] = []\n",
  },
  {
    label: "is-expr",
    src: "type T = A | B\nfunction g(v: T): i32 {\n  if v is A {\n    return 1\n  }\n  return 2\n}\n",
  },
  {
    label: "named-args",
    src: "type P = { x: i32, y: i32 }\nfunction mk(x: i32, y: i32): P { return { x: x, y: y } }\nlet p = mk(x: 1, y: 2)\n",
  },
];

// The driver imports the formatter surface. `loadToks` feeds the lexer's tokens
// into `P.toks` AND registers each retained comment with the formatter (verbatim
// text, char-offset start, 1-based line, trailing flag). `runCase` resets parser
// arena + comment table, parses, formats, and prints the framed result.
const driverHeader = `
import { tokenize } from "./lexer"
import { P, i32ToStr, nodeToks, declNameTok } from "./ast"
import { parseProgram } from "./parser"
import { formatProgram, fmtSetSource, fmtResetComments, fmtAddComment } from "./format"

function loadCase(src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  nodeToks = []
  declNameTok = []
  fmtSetSource(src)
  fmtResetComments()
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
    i = i + 1
  }
  let c = 0
  while c < r.comments.length {
    let cm = r.comments[c]
    let tr = 0
    if cm.trailing { tr = 1 }
    fmtAddComment(cm.text, cm.start, cm.line, tr)
    c = c + 1
  }
  0
}

function runCase(label: string, src: string): i32 {
  loadCase(src)
  let root = parseProgram()
  let out = formatProgram(root)
  // A MARKER line (label-tagged) announces the case; the NEXT single log entry is
  // the whole formatted output (one \`print(out)\` = one log entry, internal
  // newlines included). The host pairs marker → next-entry, so multi-line output
  // never interleaves with another case's markers.
  print("@@CASE@@\\t" + label)
  print(out)
  0
}
`;

let allLogs: Promise<Map<string, string>> | undefined;
const runAll = (): Promise<Map<string, string>> =>
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
      [FORMAT]: Deno.readTextFileSync(FORMAT),
    };
    const { wasm, diagnostics } = await compileProgramCached(DRIVER, sources);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted formatter failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    // Each `print` pushes exactly ONE log entry — the whole string, newlines and
    // all (`__print_str_flush__` does no splitting). So a `@@CASE@@\t<label>`
    // marker entry is immediately followed by a SINGLE entry holding that case's
    // complete formatted output (trailing newline included).
    const byLabel = new Map<string, string>();
    for (let i = 0; i < logs.length; i++) {
      const line = logs[i];
      if (line.startsWith("@@CASE@@\t")) {
        const label = line.slice("@@CASE@@\t".length);
        byLabel.set(label, logs[i + 1] ?? "");
        i++;
      }
    }
    return byLabel;
  })();

for (const c of CASES) {
  Deno.test(`self-hosted format: ${c.label}`, async () => {
    const got = (await runAll()).get(c.label) ?? "<missing>";
    const want = format(c.src);
    if (got !== want) {
      throw new Error(
        `format mismatch for ${c.label}\n--- host ---\n${JSON.stringify(want)}\n--- self ---\n${JSON.stringify(got)}`,
      );
    }
  });
}

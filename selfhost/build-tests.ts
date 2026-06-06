// Assembles the self-hosting lexer test cases under `tests/cases/selfhost/`.
//
// VL has no module/import system, so a test `.vl` file cannot `import` the
// lexer — it must be self-contained. This script prepends the canonical
// `selfhost/lexer.vl` source to each per-test driver and the `@run`/`@log`
// directive block, so the test files stay in sync with the lexer by
// construction. Re-run after editing `lexer.vl`:
//
//   deno run -A selfhost/build-tests.ts
//
// It runs each assembled file through the real VL compiler to capture the
// actual `log` output, then writes that output back as the `@log` assertions —
// so the committed tests assert exactly what the current compiler produces.

import { compile, runWasm } from "../compiler/compile.ts";

const here = new URL(".", import.meta.url);
const lexerSrc = await Deno.readTextFile(new URL("lexer.vl", here));
const outDir = new URL("../tests/cases/selfhost/", here);
await Deno.mkdir(outDir, { recursive: true });

type Case = { name: string; doc: string; driver: string };

const cases: Case[] = [
  {
    name: "keywords-ids-operators",
    doc:
      "Keywords, identifiers, and operators: every lexeme of `let foo = bar + " +
      "12 == x && y` is\nclassified — `let` as the LET keyword, the names as " +
      "ID, and `=`/`+`/`==`/`&&` as their\noperator kinds (longest-match picks " +
      "EQUAL_TO over two EQUALs, and AND over two AMPERSANDs).",
    driver: `let toks = tokenize("let foo = bar + 12 == x && y")
let n = 0
while n < toks.length {
  let t = toks[n]
  if t != null {
    print(t.kind)
    if t.kind != "EOF" { print(t.text) }
  }
  n = n + 1
}`,
  },
  {
    name: "numbers",
    doc:
      "Numbers: integers and floats. `3.14` takes its fractional part because a " +
      "digit follows the\ndot, but `a.5` does NOT merge — `a` is an ID, `.` a " +
      "separate DOT, `5` its own NUMBER —\nsince the dot is not preceded by a number.",
    driver: `let toks = tokenize("12 3.14 a.5 100")
let n = 0
while n < toks.length {
  let t = toks[n]
  if t != null {
    print(t.kind)
    if t.kind != "EOF" { print(t.text) }
  }
  n = n + 1
}`,
  },
  {
    name: "strings",
    doc:
      "Strings: a double-quoted literal is captured verbatim (quotes included) " +
      "and the surrounding\noperators/number lex independently. (The outer VL " +
      "literal is single-quoted so the inner\ndouble quotes pass through " +
      "untouched — VL does not decode `\\\"` escapes in source.)",
    driver: `let toks = tokenize('x = "hi" + 99')
let n = 0
while n < toks.length {
  let t = toks[n]
  if t != null {
    print(t.kind)
    if t.kind != "EOF" { print(t.text) }
  }
  n = n + 1
}`,
  },
  {
    name: "positions-comments-newlines",
    doc:
      "Positions, comments, and newlines. The input spans two source lines with " +
      "a `//` line\ncomment on the first. The comment is skipped (no token), " +
      "NEWLINE is emitted as a real\ntoken, and the second line's token reports " +
      "line 2 — so start/stop offsets and 1-based line /\n0-based col tracking " +
      "all hold across the newline. (The input string uses a real embedded\n" +
      "newline, since VL does not decode `\\n`.)",
    driver: `let toks = tokenize("ab // c
de")
let n = 0
while n < toks.length {
  let t = toks[n]
  if t != null {
    print(t.kind)
    print(t.start)
    print(t.stop)
    print(t.line)
    print(t.col)
  }
  n = n + 1
}`,
  },
];

for (const c of cases) {
  const program = `${lexerSrc}\n// ---- test driver ----\n${c.driver}\n`;
  const { diagnostics, wasm } = await compile(program);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length || !wasm) {
    console.error(`FAILED to compile ${c.name}:`, errors.map((e) => e.message));
    Deno.exit(1);
  }
  const { logs } = await runWasm(wasm);
  const docLines = c.doc.split("\n").map((l) => `// ${l}`).join("\n");
  const directives = ["// @run", ...logs.map((l) => `// @log ${l}`)].join("\n");
  const file = `${directives}\n${docLines}\n${program}`;
  const path = new URL(`${c.name}.vl`, outDir);
  await Deno.writeTextFile(path, file);
  console.log(`wrote ${c.name}.vl (${logs.length} log lines)`);
}

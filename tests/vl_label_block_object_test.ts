// `{ name: … }` IS ALWAYS AN OBJECT LITERAL; A LABEL IS `@name` (owner ruling 2026-09-30, D3374).
//
// A body, an `if`/`else` branch or a `match` arm whose braces open `{ name: …` is an object,
// shorthand inner objects (`{ b }`, `{ b, c }`) included, and a labelled block is `@B { … }`
// wherever it stands. These shapes live here rather than in a `tests/cases` fixture because
// `vl fmt` spells a shorthand key out, which would erase the shape under test. Each program
// runs on the seed and prints the value it reads back.
//
// GATING: needs the seed; registers as ignored without it.

import { COMPILER, exists } from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { runProgram } from "../playground/src/playground.ts";

const HAVE_SEED = exists(COMPILER);

const checker = () => {
  const inst = new WebAssembly.Instance(new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource), {});
  return createWasmChecker(() => inst.exports as unknown as Exports);
};

const CASES: [string, string, string[]][] = [
  ["lambda body, shorthand inner", "const b = 2\nconst g = () => { a: { b } }\nprint(g().a.b)", ["2"]],
  ["function body, shorthand inner", "function g(b: i32) { a: { b } }\nprint(g(5).a.b)", ["5"]],
  ["two shorthand keys", "const b = 2\nconst c = 3\nconst g = () => { a: { b, c } }\nprint(g().a.c)", ["3"]],
  ["a key after the inner brace", "function g(b: i32) { a: { b }, c: 1 }\nprint(g(5).c)", ["1"]],
  ["multi-line body", "function g(b: i32) {\n  a: { b }\n}\nprint(g(5).a.b)", ["5"]],
  [
    "annotated return, nested braces",
    "type P = { a: { b: i32 } }\nfunction g(b: i32): P { { a: { b } } }\nprint(g(6).a.b)",
    ["6"],
  ],
  [
    "a .map lambda",
    "const b = 2\nconst xs = [1, 2].map((_v: i32) => { a: { b } })\nprint(xs[0].a.b)",
    ["2"],
  ],
  ["nested shorthand inner (D3265)", "function g(b: i32) { a: { c: { b } } }\nprint(g(6).a.c.b)", ["6"]],
  ["three-deep shorthand (D3265)", "const b = 2\nconst g = () => { a: { c: { d: { b } } } }\nprint(g().a.c.d.b)", ["2"]],
  [
    "multi-line nested shorthand (D3265)",
    "function g(b: i32) {\n  a: {\n    c: { b }\n  }\n}\nprint(g(7).a.c.b)",
    ["7"],
  ],
  [
    "else body, nested shorthand (D3265)",
    "function g(b: i32, c: boolean) {\n  if c { { a: { d: { b } } } } else { a: { d: { b } } }\n}\nprint(g(4, false).a.d.b)",
    ["4"],
  ],
  ["empty labelled block, then a statement (D3273)", "let n = 0\nfunction h() {\n@C {}\nn = 5\n}\nh()\nprint(n)", ["5"]],
  ["lone-name labelled block, then a statement (D3273)", "let n = 0\nfunction h() {\n@C { n }\nn = 5\n}\nh()\nprint(n)", ["5"]],
  ["nested lone-name, then a statement (D3273)", "let n = 0\nfunction h() {\n@B1 { @C { n }\n n = 5 }\n}\nh()\nprint(n)", ["5"]],
  ["empty labelled block, `;` then a statement (D3273)", "let n = 0\nconst h = () => {\n@C {}; n = 5\n}\nh()\nprint(n)", ["5"]],
  ["inner shorthand then a line break and `}` stays an object (D3273)", "const b = 4\nconst v = { a: { b }\n}\nprint(v.a.b)", ["4"]],
  ["inner shorthand then a line break and `,` stays an object (D3273)", "const b = 4\nconst v = {\n  a: { b }\n  , x: b }\nprint(v.x)", ["4"]],
  ["a field value on the next line (D3274)", "const b = 3\nconst v = { a:\n  { c: { b } } }\nprint(v.a.c.b)", ["3"]],
  ["a field value after a blank line (D3274)", "const b = 3\nconst w = {\n  x:\n\n    b + 1,\n}\nprint(w.x)", ["4"]],
  ["a function body's next-line field value (D3274)", "function g(b: i32) { { a:\n  { c: b } } }\nprint(g(3).a.c)", ["3"]],
  ["a `.` line continues an inner object value (D3273)", "const g = (b: i32) => {\n  a: { x: b }\n    .x + 1\n}\nprint(g(3).a)", ["4"]],
  ["an `==` line continues an inner object value (D3273)", "const g = (b: i32) => {\n  a: { x: b }\n    == { x: b }\n}\nprint(g(3).a)", ["true"]],
  ["an `as` line continues an inner object value (D3273)", "const g = (b: i32) => {\n  a: { x: b }\n    .x\n    as f64\n}\nprint(g(3).a / 2.0)", ["1.5"]],
  ["a method call line continues an inner object value (D3273)", "const g = (b: i32) => {\n  a: { f() { b } }\n    .f()\n}\nprint(g(3).a)", ["3"]],
  ["a `-` line continues an inner object value (D3273)", "const g = (b: i32) => {\n  a: { x: b }\n    .x\n    - 1\n}\nprint(g(3).a)", ["2"]],
  ["a second field's continued value (D3273)", "const g = (b: i32) => {\n  a: { x: b }\n  , c: { x: b }\n    .x\n}\nprint(g(3).c)", ["3"]],
  [
    "a labelled block still parses as one",
    "function g(n: i32) {\n  let r = 0\n  @a { r = n }\n  r\n}\nprint(g(7))",
    ["7"],
  ],
  ["function body (D3374)", "function f() { a: 1 }\nprint(f().a)", ["1"]],
  ["if and else branches (D3374)", "function g(c: boolean) { if c { a: 1 } else { a: 2 } }\nprint(g(true).a)\nprint(g(false).a)", ["1", "2"]],
  ["lambda body (D3374)", "const h = () => { a: 1 }\nprint(h().a)", ["1"]],
  ["match arms (D3374)", "function m(k: i32) { match k { 1 => { a: 1 }, _ => { a: 3 } } }\nprint(m(1).a)\nprint(m(2).a)", ["1", "3"]],
  ["then branch, shorthand inner (D3374)", "function h(b: i32, c: boolean) { if c { a: { b } } else { a: { b: 0 } } }\nprint(h(4, true).a.b)", ["4"]],
  ["match arm, shorthand inner (D3276)", "function h(b: i32) { match b { 3 => { a: { b } }, _ => { a: { b } } } }\nprint(h(3).a.b)", ["3"]],
  ["if-expression branches", "const c = 2 > 1\nconst o = if c { x: 1, y: 2 } else { x: 3, y: 4 }\nprint(o.y)", ["2"]],
];

for (const [name, src, want] of CASES) {
  Deno.test({ name: `label vs object: ${name}`, ignore: !HAVE_SEED }, async () => {
    const r = await runProgram(src, checker());
    if (!r.compiled || JSON.stringify(r.logs) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)}, got compiled=${r.compiled} logs=${JSON.stringify(r.logs)}`);
    }
  });
}

// Exact messages: an error after an object branch is only that error, and a label goes before
// `while`, `for` or `{` on its own line.
const DIAGS: [string, string, string[]][] = [
  [
    "an unrelated error after an object branch is only that error",
    "function k() {}\nfunction m(c: boolean) {\n  if c { a: { c } }\n  const x: i32 = k()\n  print(x)\n}",
    ["cannot bind the void result of 'x' — a void function returns no value"],
  ],
  [
    "an empty branch is never recorded",
    "function k() {}\nfunction m(c: boolean) {\n  if c {}\n  const x: i32 = k()\n  print(x)\n}",
    ["cannot bind the void result of 'x' — a void function returns no value"],
  ],
  [
    "`a:` then a loop on the next line is an object field holding the loop",
    "let n = 0\nconst h = () => {\n  a:\n  while n < 5 { n = n + 1 }\n}",
    ["field 'a' expects a value, got void"],
  ],
  [
    "a label whose loop starts on the next line",
    "let n = 0\nconst h = () => {\n  @a\n  while n < 5 { n = n + 1 }\n}",
    ["a label goes before `while`, `for` or `{`: `@a while …`, `@a { … }`"],
  ],
];

for (const [name, src, want] of DIAGS) {
  Deno.test({ name: `label vs object diagnostics: ${name}`, ignore: !HAVE_SEED }, async () => {
    const got = (await checker().check(src, "/m.vl", () => undefined)).map((d) => d.message);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  });
}

// A BODY `{ a: { b } }` IS AN OBJECT LITERAL, NOT A LABELLED BLOCK (#3293 landing review).
//
// `name: {` opens a labelled block only when the inner braces plainly hold statements. A
// shorthand inner object (`{ b }`, `{ b, c }`) or a key after the inner `}` keeps the outer
// braces an object literal, as on master. These shapes live here rather than in a
// `tests/cases` fixture because `vl fmt` spells a shorthand key out, which would erase the
// shape under test. Each program runs on the seed and prints the value it reads back.
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
  ["empty labelled block, then a statement (D3273)", "let n = 0\nfunction h() {\nC: {}\nn = 5\n}\nh()\nprint(n)", ["5"]],
  ["lone-name labelled block, then a statement (D3273)", "let n = 0\nfunction h() {\nC: { n }\nn = 5\n}\nh()\nprint(n)", ["5"]],
  ["nested lone-name, then a statement (D3273)", "let n = 0\nfunction h() {\nB1: { C: { n }\n n = 5 }\n}\nh()\nprint(n)", ["5"]],
  ["empty labelled block, `;` then a statement (D3273)", "let n = 0\nconst h = () => {\nC: {}; n = 5\n}\nh()\nprint(n)", ["5"]],
  ["inner shorthand then a line break and `}` stays an object (D3273)", "const b = 4\nconst v = { a: { b }\n}\nprint(v.a.b)", ["4"]],
  ["inner shorthand then a line break and `,` stays an object (D3273)", "const b = 4\nconst v = {\n  a: { b }\n  , x: b }\nprint(v.x)", ["4"]],
  ["a field value on the next line (D3274)", "const b = 3\nconst v = { a:\n  { c: { b } } }\nprint(v.a.c.b)", ["3"]],
  ["a field value after a blank line (D3274)", "const b = 3\nconst w = {\n  x:\n\n    b + 1,\n}\nprint(w.x)", ["4"]],
  ["a function body's next-line field value (D3274)", "function g(b: i32) { { a:\n  { c: b } } }\nprint(g(3).a.c)", ["3"]],
  [
    "a labelled block still parses as one",
    "function g(n: i32) {\n  let r = 0\n  a: { r = n }\n  r\n}\nprint(g(7))",
    ["7"],
  ],
];

for (const [name, src, want] of CASES) {
  Deno.test({ name: `label vs object: ${name}`, ignore: !HAVE_SEED }, async () => {
    const r = await runProgram(src, checker());
    if (!r.compiled || JSON.stringify(r.logs) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)}, got compiled=${r.compiled} logs=${JSON.stringify(r.logs)}`);
    }
  });
}

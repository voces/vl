// The per-function effects summary (function-effects-design.md §C1, D2135), read through its two
// day-one readers: the dump (`effectsDump`, one line per function and pinned instance) and the
// hover line (`effectsAt`, rendered by `withEffects`). A wrong fact fails here by name.
//
// The fixture is one program with a function per case the summary must tell apart: a generic at
// two types whose `==` differs (one instruction at `i32`, a loop at `string`), mutual recursion,
// an allocation in one branch only, a host call, a std function and a UFCS call to one, a module
// `let` write against a local write, a parameter write against a write into a fresh literal, a
// closure called through a value, an un-annotated return, a string-literal compare priced at its
// length, a getter read, a string concatenation, `+`, `%` and a user operator over a type
// parameter (decided per pinned instance, and "anything" when unbound), a module `let` read
// against a module `const` table read, and a literal that holds a parameter's object (a write
// through it is a write). Seed-gated like the other wasm suites.
//   deno test -A --no-check tests/vl_effects_summary_test.ts

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { withEffects } from "../lsp/src/typeFeatures.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const noSiblings = () => undefined;

const SRC = [
  /*  0 */ 'import { hypotF64 } from "std:math"',
  /*  1 */ "type V = new { x: f64, n: i32, s: string }",
  /*  2 */ "type P = { a: i32 }",
  /*  3 */ "let count = 0",
  /*  4 */ "const LIMIT = 4",
  /*  5 */ "function clamp01(x: f64): f64 { if x < 0.0 { 0.0 } else if x > 1.0 { 1.0 } else { x } }",
  /*  6 */ "function inferred(n: i32) { n + 1 }",
  /*  7 */ "function same<T>(a: T, b: T): boolean { a == b }",
  /*  8 */ 'function useSame(n: i32, s: string): boolean { same(n, 1) && same(s, "a") }',
  /*  9 */ "function oneBranch(n: i32): i32 { if n > 0 { [n][0] } else { n } }",
  /* 10 */ "function says(n: i32): i32 {",
  /* 11 */ "  print(n)",
  /* 12 */ "  n",
  /* 13 */ "}",
  /* 14 */ "function isEven(n: i32): boolean { if n == 0 { true } else { isOdd(n - 1) } }",
  /* 15 */ "function isOdd(n: i32): boolean { if n == 0 { false } else { isEven(n - 1) } }",
  /* 16 */ "function bump(): i32 {",
  /* 17 */ "  count = count + 1",
  /* 18 */ "  count",
  /* 19 */ "}",
  /* 20 */ "function local(): i32 {",
  /* 21 */ "  let k = 0",
  /* 22 */ "  k = k + LIMIT",
  /* 23 */ "  k",
  /* 24 */ "}",
  /* 25 */ "function setA(p: P): i32 {",
  /* 26 */ "  p.a = 1",
  /* 27 */ "  0",
  /* 28 */ "}",
  /* 29 */ "function fresh(): i32 {",
  /* 30 */ "  const p: P = { a: 0 }",
  /* 31 */ "  p.a = 3",
  /* 32 */ "  p.a",
  /* 33 */ "}",
  /* 34 */ "function closes(n: i32): i32 {",
  /* 35 */ "  const f = (k: i32) => k + n",
  /* 36 */ "  f(1)",
  /* 37 */ "}",
  /* 38 */ "function hyp(self: V): f64 { hypotF64(self.x, 1.0) }",
  /* 39 */ "function viaUfcs(v: V): f64 { v.hyp() }",
  /* 40 */ 'function isAb(s: string): boolean { s == "ab" }',
  /* 41 */ 'function greet(s: string): string { "hi " + s }',
  /* 42 */ "get lenish(self: V): i32 { self.n + 1 }",
  /* 43 */ "function readsGetter(v: V): i32 { v.lenish }",
  /* 44 */ "print(clamp01(0.5) + inferred(1) as f64 + says(1) as f64 + local() as f64 + fresh() as f64)",
  /* 45 */ 'print(useSame(1, "a") && isEven(4) && isAb("ab"))',
  /* 46 */ "print(oneBranch(1) + bump() + setA({ a: 0 }) + closes(2) + readsGetter({ x: 1.0, n: 1, s: \"\" }))",
  /* 47 */ 'print(viaUfcs({ x: 3.0, n: 1, s: "" }))',
  /* 48 */ 'print(greet("x"))',
  /* 49 */ "function addT<T>(a: T, b: T): T { a + b }",
  /* 50 */ "function remT<T>(a: T, b: T): T { a % b }",
  /* 51 */ "type Q = new { q: i32 }",
  /* 52 */ 'function "+"(self: Q, o: Q): Q { count = count + 1; self }',
  /* 53 */ 'function useAdd(s: string): string { addT(s, "a") }',
  /* 54 */ "function useRem(x: f64): f64 { remT(x, 2.0) }",
  /* 55 */ "function useOp(q: Q): Q { addT(q, q) }",
  /* 56 */ "const TABLE = [1, 2]",
  /* 57 */ "function readsTable(i: i32): i32 { TABLE[i] }",
  /* 58 */ "function readsCount(): i32 { count }",
  /* 59 */ "function viaLiteral(p: P): i32 {",
  /* 60 */ "  const w = { inner: p }",
  /* 61 */ "  w.inner.a = 5",
  /* 62 */ "  0",
  /* 63 */ "}",
  /* 64 */ 'print(useAdd("x"))',
  /* 65 */ "print(useRem(3.0) + (readsTable(0) + readsCount() + viaLiteral({ a: 1 }) + useOp({ q: 1 }).q) as f64)",
  "",
].join("\n");

const NONE = "writes: none · reads: none · allocates: no";
const WANT = [
  `clamp01: ${NONE} · cost: 0 steps · I/O: none`,
  `inferred: ${NONE} · cost: 0 steps · I/O: none`,
  "same: writes: unknown · reads: unknown · allocates: unknown · cost: unbounded · I/O: unknown, because it applies `==` over an unbound type parameter at line 8",
  `same<T = i32>: ${NONE} · cost: 0 steps · I/O: none`,
  `same<T = string>: ${NONE} · cost: unbounded (it compares \`string\` values with \`==\` at line 8) · I/O: none`,
  `useSame: ${NONE} · cost: unbounded (it compares \`string\` values with \`==\` at line 8, via \`same()\`) · I/O: none`,
  "oneBranch: writes: none · reads: none · allocates: yes (a list literal at line 10) · cost: 0 steps · I/O: none",
  `says: ${NONE} · cost: unbounded (it calls the host function \`print\`) · I/O: \`print\``,
  `isEven: ${NONE} · cost: unbounded (it recurses through \`isOdd()\`) · I/O: none`,
  `isOdd: ${NONE} · cost: unbounded (it recurses through \`isEven()\`) · I/O: none`,
  "bump: writes: the module `let` `count` · reads: the module `let` `count` · allocates: no · cost: 0 steps · I/O: none",
  `local: ${NONE} · cost: 0 steps · I/O: none`,
  "setA: writes: `p.a` · reads: none · allocates: no · cost: 0 steps · I/O: none",
  "fresh: writes: none · reads: none · allocates: yes (a struct literal at line 31) · cost: 0 steps · I/O: none",
  "closes: writes: unknown (a call of a function value at line 37) · reads: unknown (a call of a function value at line 37) · allocates: yes (a closure at line 36) · cost: unbounded (it calls a function value at line 37) · I/O: unknown (a call of a function value at line 37)",
  `hyp: ${NONE} · cost: 1 step · I/O: none`,
  `viaUfcs: ${NONE} · cost: 2 steps · I/O: none`,
  `isAb: ${NONE} · cost: 2 steps · I/O: none`,
  "greet: writes: none · reads: none · allocates: yes (a string concatenation at line 42) · cost: unbounded (it concatenates strings at line 42) · I/O: none",
  `get lenish: ${NONE} · cost: 0 steps · I/O: none`,
  `readsGetter: ${NONE} · cost: 1 step · I/O: none`,
  "addT: writes: unknown · reads: unknown · allocates: unknown · cost: unbounded · I/O: unknown, because it applies `+` over an unbound type parameter at line 50",
  "addT<T = string>: writes: none · reads: none · allocates: yes (a string concatenation at line 50) · cost: unbounded (it concatenates strings at line 50) · I/O: none",
  'addT<T = Q>: writes: the module `let` `count`, via operator "+" for Q · reads: the module `let` `count`, via operator "+" for Q · allocates: no · cost: 1 step · I/O: none',
  "remT: writes: unknown · reads: unknown · allocates: unknown · cost: unbounded · I/O: unknown, because it applies `%` over an unbound type parameter at line 51",
  `remT<T = f64>: ${NONE} · cost: unbounded (it takes a float remainder at line 51) · I/O: none`,
  'operator "+" for Q: writes: the module `let` `count` · reads: the module `let` `count` · allocates: no · cost: 0 steps · I/O: none',
  "useAdd: writes: none · reads: none · allocates: yes (a string concatenation at line 50, via `addT()`) · cost: unbounded (it concatenates strings at line 50, via `addT()`) · I/O: none",
  `useRem: ${NONE} · cost: unbounded (it takes a float remainder at line 51, via \`remT()\`) · I/O: none`,
  "useOp: writes: the module `let` `count`, via `addT()` · reads: the module `let` `count`, via `addT()` · allocates: no · cost: 2 steps · I/O: none",
  `readsTable: ${NONE} · cost: 0 steps · I/O: none`,
  "readsCount: writes: none · reads: the module `let` `count` · allocates: no · cost: 0 steps · I/O: none",
  "viaLiteral: writes: `w.inner.a` · reads: none · allocates: yes (a struct literal at line 61) · cost: 0 steps · I/O: none",
];

Deno.test({ name: "effects summary: the dump pins every fact", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const got = (await checker.effectsDump!(SRC, "/tmp/effects.vl", noSiblings))
    .split("\n").filter((l) => l !== "");
  const missing = WANT.filter((w) => !got.includes(w));
  const extra = got.filter((g) => !WANT.includes(g));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `effects dump drifted\nwant (missing):\n${missing.join("\n")}\ngot (extra):\n${
        extra.join("\n")
      }`,
    );
  }
  if (got.join("\n") !== WANT.join("\n")) {
    throw new Error(`effects dump order drifted:\n${got.join("\n")}`);
  }
});

Deno.test({ name: "effects summary: hover shows the callee's line", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const at = (line: number, col: number) =>
    checker.effectsAt!(SRC, "/tmp/effects.vl", noSiblings, line, col);
  const cases: [number, number, string | undefined][] = [
    [44, 8, `${NONE} · cost: 0 steps · I/O: none`], // a use of `clamp01`
    [8, 10, `${NONE} · cost: unbounded (it compares \`string\` values with \`==\` at line 8, via \`same()\`) · I/O: none`], // the declaration of `useSame`
    [17, 3, undefined], // `count`, a module `let`, is not a function
  ];
  for (const [line, col, want] of cases) {
    const got = await at(line, col);
    if (got !== want) {
      throw new Error(`effectsAt ${line}:${col}: want ${want}, got ${got}`);
    }
  }
});

Deno.test("effects summary: the hover body puts the line under the type", () => {
  const body = "```vital\nf: (x: i32) => i32\n```";
  const line = "writes: none · reads: none · allocates: no · cost: 0 steps · I/O: none";
  const want = `${body}\n\n${line}`;
  if (withEffects(body, line) !== want) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(withEffects(body, line))}`);
  }
  if (withEffects(body, undefined) !== body || withEffects(body, "  ") !== body) {
    throw new Error("no summary must leave the hover body unchanged");
  }
});

// Proves the AST-driven slice of the VL-in-VL back end: `emitProgram`
// (`compiler/wasmEmit.vl`) walks the real arena AST and emits a valid module —
// unlike the fixed-bytes spike (`selfhost_wasm_emit_test.ts`), which never reads
// the arena.
//
// The pipeline runs entirely through the real VL toolchain, from raw SOURCE TEXT:
// the genuine lexer (`compiler/lexer.vl`) tokenizes the string, the genuine parser
// (`compiler/parser.vl`) builds the `compiler/ast.vl` arena, and `emitProgram`
// reads that arena to produce the module bytes. The TS runner parses the emitted
// byte string back into a `Uint8Array` and hands it to the real
// `WebAssembly.instantiate` — so the proof is SOURCE → arena → bytes → real engine.
//
// VL has no module system yet, so the sources are concatenated ahead of a `.vl`
// print-driver, compiled to wasm, and run. Like `selfhost_pipeline_test.ts`, the
// lexer and parser/ast were ported separately and define COLLIDING names (`Tok`,
// `Diag`, `advance`); the runner renames the lexer's three in its SOURCE TEXT
// before concatenation (glue only — no `.vl` compiler file is edited).
//
// PERF (compile-once): every case compiles the SAME base (lexer + ast + parser +
// wasmEmit) and differs only in the driven source — so recompiling the base once
// per case was the dominant CI cost (and is NOT cacheable for compiler-change PRs,
// which change the very emitter under test). All cases now run in ONE module: the
// driver runs `emitProgram` over each source in turn, resetting the parser arena
// (`P`) and emitter state (`W`/`fnNames`/`fnIndices`/`localNames`) between them, and
// prints each result prefixed with a per-case key. The host splits the logs per key;
// each `Deno.test` pulls its case's bytes and runs its own (cheap) instantiate +
// assertions. Same coverage (real lexer→parser→emitProgram on every case; binaryen
// optimize() still runs, once) at a fraction of the time.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// The lexer, with its three names that collide with `ast.vl`/`parser.vl` renamed
// in the SOURCE TEXT. Pure glue: the on-disk `lexer.vl` is untouched.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");

const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// Parse the single `main: b0,b1,...` log line into a byte array.
const bytesFromLog = (logs: string[]): Uint8Array<ArrayBuffer> => {
  const line = logs.find((l) => l.startsWith("main: "));
  if (!line) {
    throw new Error(
      `emitter did not print a \`main:\` line; got ${JSON.stringify(logs)}`,
    );
  }
  const nums = line.slice("main: ".length).split(",").map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`byte out of range in emitter output: ${s}`);
    }
    return n;
  });
  return new Uint8Array(nums);
};

// Instantiate the VL-emitted bytes and call the export `name` with `args`.
const runExport = async (
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  ...args: number[]
): Promise<number> => {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  const fn = instance.exports[name] as (...a: number[]) => number;
  return fn(...args);
};

// Convenience for the zero-arg `main` export used by the trivial cases.
const runMain = (bytes: Uint8Array<ArrayBuffer>): Promise<number> =>
  runExport(bytes, "main");

// Each case: a name, the VL SOURCE TEXT to drive through lexer→parser→emitProgram,
// and a `check` over that case's log lines (`["main: b0,b1,..."]` on success, an
// `["err: <msg>"]` line on an unsupported shape) — exactly what the old per-test
// `runFor(src)` returned, so the checks read unchanged.
type Case = {
  name: string;
  src: string;
  check: (logs: string[]) => void | Promise<void>;
};

const CASES: Case[] = [
  {
    name:
      "arena walk of `main(): i32 { return 42 }` instantiates to main()===42",
    src: "function main(): i32 {\n  return 42\n}\n",
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
    },
  },
  {
    name: "a different literal flows from source through the arena",
    src: "function main(): i32 {\n  return 7\n}\n",
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name: "a non-`main` function exports under its own name",
    src: "function other(): i32 {\n  return 1\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "other");
      if (got !== 1) throw new Error(`other() returned ${got}, expected 1`);
    },
  },
  {
    name: "`return x` of an i32 param lowers to local.get",
    src: "function id(x: i32): i32 {\n  return x\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "id", 7);
      if (got !== 7) throw new Error(`id(7) returned ${got}, expected 7`);
    },
  },
  {
    name: "`return a + b` over two params lowers to i32.add",
    src: "function add(a: i32, b: i32): i32 {\n  return a + b\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "add", 2, 3);
      if (got !== 5) throw new Error(`add(2, 3) returned ${got}, expected 5`);
    },
  },
  {
    name: "`return x + x` reuses the same param twice",
    src: "function double(x: i32): i32 {\n  return x + x\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "double", 21);
      if (got !== 42) {
        throw new Error(`double(21) returned ${got}, expected 42`);
      }
    },
  },
  {
    name: "literal arithmetic `return 6 * 7` folds at runtime to 42",
    src: "function lit(): i32 {\n  return 6 * 7\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "lit");
      if (got !== 42) throw new Error(`lit() returned ${got}, expected 42`);
    },
  },
  {
    name: "nested params + ops `return a * b - c` evaluates correctly",
    src: "function f(a: i32, b: i32, c: i32): i32 {\n  return a * b - c\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f", 5, 4, 3);
      if (got !== 17) {
        throw new Error(`f(5, 4, 3) returned ${got}, expected 17`);
      }
    },
  },
  {
    name: "a recursive `fib` compiles, calls itself, and runs",
    src:
      "function fib(n: i32): i32 {\n  if n < 2 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "fib", 10);
      if (got !== 55) throw new Error(`fib(10) returned ${got}, expected 55`);
    },
  },
  {
    name: "a recursive `fact` multiplies down to the base case",
    src:
      "function fact(n: i32): i32 {\n  if n <= 1 { return 1 }\n  return n * fact(n - 1)\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "fact", 5);
      if (got !== 120) throw new Error(`fact(5) returned ${got}, expected 120`);
    },
  },
  {
    name: "a two-function call chain links `main` to a helper",
    src:
      "function inc(x: i32): i32 {\n  return x + 1\n}\nfunction main(): i32 {\n  return inc(41)\n}\n",
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const main = await runExport(bytes, "main");
      if (main !== 42) throw new Error(`main() returned ${main}, expected 42`);
      const inc = await runExport(bytes, "inc", 9);
      if (inc !== 10) throw new Error(`inc(9) returned ${inc}, expected 10`);
    },
  },
  {
    name: "a non-recursive `if` branch picks a sign",
    src:
      "function sign(n: i32): i32 {\n  if n < 0 { return -1 }\n  return 1\n}\n",
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const neg = await runExport(bytes, "sign", -5);
      if (neg !== -1) throw new Error(`sign(-5) returned ${neg}, expected -1`);
      const pos = await runExport(bytes, "sign", 5);
      if (pos !== 1) throw new Error(`sign(5) returned ${pos}, expected 1`);
    },
  },
  {
    name: "`let`/`const` locals + assignment compile to wasm locals",
    src:
      "function f(n: i32): i32 {\n  let acc = n * 2\n  const bonus = 5\n  acc = acc + bonus\n  return acc\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f", 10);
      if (got !== 25) throw new Error(`f(10) returned ${got}, expected 25`);
    },
  },
  {
    name: "a local reused/reassigned across several statements",
    src:
      "function acc3(a: i32, b: i32, c: i32): i32 {\n  let sum = a\n  sum = sum + b\n  sum = sum + c\n  return sum\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "acc3", 4, 5, 6);
      if (got !== 15) {
        throw new Error(`acc3(4, 5, 6) returned ${got}, expected 15`);
      }
    },
  },
  {
    name: "a local feeds a call argument",
    src:
      "function inc(x: i32): i32 {\n  return x + 1\n}\nfunction main(): i32 {\n  let base = 40\n  let plus = base + 1\n  return inc(plus)\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
    },
  },
  {
    name: "a local drives an `if` condition",
    src:
      "function clamp(n: i32): i32 {\n  let over = n > 100\n  if over { return 100 }\n  return n\n}\n",
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const hi = await runExport(bytes, "clamp", 250);
      if (hi !== 100) {
        throw new Error(`clamp(250) returned ${hi}, expected 100`);
      }
      const lo = await runExport(bytes, "clamp", 7);
      if (lo !== 7) throw new Error(`clamp(7) returned ${lo}, expected 7`);
    },
  },
  {
    name: "a non-i32 local init fails loudly, not with garbage bytes",
    // A float local is neither i32 nor a supported ref type (string locals ARE now
    // supported — see the STRINGS cases below — so the old `let s = "hi"` no longer
    // fails; a float literal stays out of scope).
    src: "function bad(): i32 {\n  let s = 3.14\n  return 0\n}\n",
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the non-i32 local; got ${
            JSON.stringify(logs)
          }`,
        );
      }
      if (!errLine.includes("i32 locals")) {
        throw new Error(`unexpected emitter error message: ${errLine}`);
      }
    },
  },
  {
    name: "an unsupported shape fails loudly, not with garbage bytes",
    src: "function bad(a: i32): i32 {\n  return a / 2\n}\n",
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the unsupported shape; got ${
            JSON.stringify(logs)
          }`,
        );
      }
      if (!errLine.includes("operator")) {
        throw new Error(`unexpected emitter error message: ${errLine}`);
      }
    },
  },
  {
    name: "while loop counts up to 5",
    src: [
      "function main(): i32 {",
      "  let i = 0",
      "  while i < 5 { i = i + 1 }",
      "  return i",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    name: "while loop accumulates a sum (0+1+2+3 = 6)",
    src: [
      "function main(): i32 {",
      "  let i = 0",
      "  let sum = 0",
      "  while i < 4 {",
      "    sum = sum + i",
      "    i = i + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 6) throw new Error(`main() returned ${got}, expected 6`);
    },
  },
  {
    name: "while-false loop runs zero iterations",
    src: [
      "function main(): i32 {",
      "  let x = 42",
      "  while x < 0 { x = x + 1 }",
      "  return x",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
    },
  },
  {
    name: "while loop with local declared inside the body",
    // total = 3*2 + 2*2 + 1*2 = 12
    src: [
      "function main(): i32 {",
      "  let total = 0",
      "  let n = 3",
      "  while n > 0 {",
      "    let delta = n * 2",
      "    total = total + delta",
      "    n = n - 1",
      "  }",
      "  return total",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 12) throw new Error(`main() returned ${got}, expected 12`);
    },
  },
  {
    name: "while loop in helper called from main (sum 0..10 = 55)",
    src: [
      "function sum(n: i32): i32 {",
      "  let i = 0",
      "  let acc = 0",
      "  while i <= n {",
      "    acc = acc + i",
      "    i = i + 1",
      "  }",
      "  return acc",
      "}",
      "function main(): i32 {",
      "  return sum(10)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const got = await runMain(bytes);
      if (got !== 55) throw new Error(`main() returned ${got}, expected 55`);
      const direct = await runExport(bytes, "sum", 10);
      if (direct !== 55) {
        throw new Error(`sum(10) returned ${direct}, expected 55`);
      }
    },
  },
  // ── WasmGC structs ─────────────────────────────────────────────────────────
  // A `type` declaration lowers to a GC struct type (type index 0); an object
  // literal lowers to `struct.new`, a field read to `struct.get`. These prove real
  // `WebAssembly.instantiate` over the VL-emitted GC bytes — source → arena → bytes
  // → engine — for construction, field indexing, and structs across function calls.
  {
    name: "construct a struct and read its first field (`p.x` => 7)",
    src: [
      "type P = { x: i32, y: i32 }",
      "function main(): i32 {",
      "  let p = { x: 7, y: 9 }",
      "  return p.x",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name: "read a non-first struct field (`p.y` => 9) proves field indexing",
    src: [
      "type P = { x: i32, y: i32 }",
      "function main(): i32 {",
      "  let p = { x: 7, y: 9 }",
      "  return p.y",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 9) throw new Error(`main() returned ${got}, expected 9`);
    },
  },
  {
    name:
      "a struct-typed annotation (`let p: Point = …`) + both fields summed => 43",
    src: [
      "type Point = { x: i32, y: i32 }",
      "function main(): i32 {",
      "  let p: Point = { x: 3, y: 40 }",
      "  return p.x + p.y",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 43) throw new Error(`main() returned ${got}, expected 43`);
    },
  },
  {
    name: "a struct returned from a helper, then read field-by-field => 42",
    src: [
      "type P = { x: i32, y: i32 }",
      "function mk(a: i32, b: i32): P {",
      "  return { x: a, y: b }",
      "}",
      "function main(): i32 {",
      "  let p = mk(20, 22)",
      "  return p.x + p.y",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const main = await runMain(bytes);
      if (main !== 42) throw new Error(`main() returned ${main}, expected 42`);
      // `mk` returns a `(ref $0)`, so it is NOT callable directly from JS; the proof
      // is that `main` constructs through it and reads the fields back correctly.
    },
  },
  {
    name: "a struct passed INTO a helper, read through the param => 11",
    src: [
      "type P = { x: i32, y: i32 }",
      "function sumXY(p: P): i32 {",
      "  return p.x + p.y",
      "}",
      "function main(): i32 {",
      "  let q = { x: 5, y: 6 }",
      "  return sumXY(q)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 11) throw new Error(`main() returned ${got}, expected 11`);
    },
  },
  {
    name: "a non-i32 struct field fails loudly, not with garbage bytes",
    src: [
      "type P = { x: f64 }",
      "function main(): i32 {",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the non-i32 struct field; got ${
            JSON.stringify(logs)
          }`,
        );
      }
      if (!errLine.includes("i32 struct fields")) {
        throw new Error(`unexpected emitter error message: ${errLine}`);
      }
    },
  },
  // ── WasmGC arrays ──────────────────────────────────────────────────────────
  // An array literal lowers to `array.new_fixed` over the i32 array heap type, an
  // index read to `array.get`, `.length` to `array.len`, and `a[i] = v` to
  // `array.set`. These prove real `WebAssembly.instantiate` over the VL-emitted GC
  // bytes — source → arena → bytes → engine — for construction, indexing, length,
  // and indexed store. WasmGC arrays are FIXED-LENGTH; growable `.push` is deferred.
  {
    name: "construct an array literal and read an element (`a[1]` => 20)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [10, 20, 30]",
      "  return a[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 20) throw new Error(`main() returned ${got}, expected 20`);
    },
  },
  {
    name: "read the first and last elements summed (`a[0] + a[2]` => 40)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [10, 20, 30]",
      "  return a[0] + a[2]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 40) throw new Error(`main() returned ${got}, expected 40`);
    },
  },
  {
    name: "`a.length` of a 3-element array => 3",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [10, 20, 30]",
      "  return a.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    name: "index assignment then read (`a[1] = 99; return a[1]` => 99)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [10, 20, 30]",
      "  a[1] = 99",
      "  return a[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 99) throw new Error(`main() returned ${got}, expected 99`);
    },
  },
  {
    name:
      "a computed index + value (`a[i] = a[0] + p` then read) instantiates",
    src: [
      "function build(p: i32, q: i32): i32 {",
      "  let a: i32[] = [p, q, p + q]",
      "  a[1] = a[0] + p",
      "  return a[1] + a[2] + a.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      // a = [3, 5, 8]; a[1] = a[0] + 3 = 6; return 6 + 8 + 3 = 17.
      const got = await runExport(bytes, "build", 3, 5);
      if (got !== 17) {
        throw new Error(`build(3, 5) returned ${got}, expected 17`);
      }
    },
  },
  {
    name: "sum array elements in a `while` loop (drives array in a loop) => 60",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [10, 20, 30]",
      "  let sum = 0",
      "  let i = 0",
      "  while i < a.length {",
      "    sum = sum + a[i]",
      "    i = i + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 60) throw new Error(`main() returned ${got}, expected 60`);
    },
  },
  {
    name: "an array passed INTO a helper, summed through the param => 6",
    src: [
      "function sum3(a: i32[]): i32 {",
      "  return a[0] + a[1] + a[2]",
      "}",
      "function main(): i32 {",
      "  let xs: i32[] = [1, 2, 3]",
      "  return sum3(xs)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 6) throw new Error(`main() returned ${got}, expected 6`);
    },
  },
  {
    name: "a non-i32 array element type (`string[]`) fails loudly",
    src: [
      "function main(): i32 {",
      "  let a: string[] = []",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the non-i32 array; got ${
            JSON.stringify(logs)
          }`,
        );
      }
      if (!errLine.includes("i32[] arrays")) {
        throw new Error(`unexpected emitter error message: ${errLine}`);
      }
    },
  },
  // ── growable arrays + `.push` ──────────────────────────────────────────────
  // An `i32[]` is now the growable `{ backing, len, cap }` wrapper struct (mirroring
  // `toWasm.ts`'s list rep). `[…]` literals build it (len=cap=N); `.push(x)` grows the
  // backing (2× / floor 4) when full, then writes + bumps `len`; `.length` reads the
  // `len` field; `a[i]`/`a[i]=v` go through the backing. These force a real grow (past
  // the initial capacity), a `while`-loop build, an empty-`[]` start, and push→set→read.
  {
    name: "push past initial capacity forces a grow (`[]` then 5 pushes => 50)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = []",
      "  a.push(10)",
      "  a.push(20)",
      "  a.push(30)",
      "  a.push(40)",
      "  a.push(50)",
      "  return a[4]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 50) throw new Error(`main() returned ${got}, expected 50`);
    },
  },
  {
    name: "push past a non-empty literal's capacity (`[1,2]` + 2 pushes, len => 4)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = [1, 2]",
      "  a.push(3)",
      "  a.push(4)",
      "  return a.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 4) throw new Error(`main() returned ${got}, expected 4`);
    },
  },
  {
    name: "build an array in a `while` loop then sum it (0+1+...+9 = 45)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = []",
      "  let i = 0",
      "  while i < 10 {",
      "    a.push(i)",
      "    i = i + 1",
      "  }",
      "  let sum = 0",
      "  let j = 0",
      "  while j < a.length {",
      "    sum = sum + a[j]",
      "    j = j + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 45) throw new Error(`main() returned ${got}, expected 45`);
    },
  },
  {
    name: "`[]` + push + `.length` (empty literal grows to len 3)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = []",
      "  a.push(7)",
      "  a.push(8)",
      "  a.push(9)",
      "  return a.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    name: "push then index-set then read (`push 5; a[0] = 99; a[0]` => 99)",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = []",
      "  a.push(5)",
      "  a[0] = 99",
      "  return a[0]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 99) throw new Error(`main() returned ${got}, expected 99`);
    },
  },
  {
    name: "push in a helper, summed by the caller (build 1..4, sum => 10)",
    src: [
      "function build(n: i32): i32[] {",
      "  let a: i32[] = []",
      "  let i = 1",
      "  while i <= n {",
      "    a.push(i)",
      "    i = i + 1",
      "  }",
      "  return a",
      "}",
      "function main(): i32 {",
      "  let a: i32[] = build(4)",
      "  let sum = 0",
      "  let i = 0",
      "  while i < a.length {",
      "    sum = sum + a[i]",
      "    i = i + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 10) throw new Error(`main() returned ${got}, expected 10`);
    },
  },
  // ── strings ────────────────────────────────────────────────────────────────
  // A VL string is CURRENTLY a WasmGC `array i32` of Unicode CODE POINTS (per
  // `docs/strings-design.md`), so it REUSES the array slice's machinery: a string
  // literal lowers to `array.new_fixed` over the SAME i32 array heap type, `.length`
  // to `array.len` (a code-point count), and `s[i]` to `array.get` (an i32 code
  // point). These prove real `WebAssembly.instantiate` over the VL-emitted GC bytes —
  // source → arena → bytes → engine. A string value is a `(ref $array)`, so (like
  // structs/arrays) it is NOT directly JS-callable; the proofs return i32s.
  // Concatenation (`+`), equality (`==`), `slice`/`indexOf`, and the UTF-8 `array i8`
  // storage migration (B7) are DEFERRED — out of scope for this slice.
  {
    name: 'a string literal\'s `.length` ("abc".length => 3)',
    src: [
      "function main(): i32 {",
      '  let s = "abc"',
      "  return s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    name: 'indexing a string yields a code point ("abc"[1] => 98)',
    src: [
      "function main(): i32 {",
      '  let s = "abc"',
      "  return s[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 'b' is U+0062 = 98.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 98) throw new Error(`main() returned ${got}, expected 98`);
    },
  },
  {
    name: "a string-typed annotation (`let s: string = …`) indexes to a code point",
    src: [
      "function main(): i32 {",
      '  let s: string = "VL"',
      "  return s[0]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 'V' is U+0056 = 86.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 86) throw new Error(`main() returned ${got}, expected 86`);
    },
  },
  {
    name: "an escape decodes to its code point (`\"a\\nb\"[1]` => 10)",
    src: [
      "function main(): i32 {",
      '  let s = "a\\nb"',
      "  return s[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // `\n` is U+000A = 10, and the literal has length 3 (a, newline, b).
      const got = await runMain(bytesFromLog(logs));
      if (got !== 10) throw new Error(`main() returned ${got}, expected 10`);
    },
  },
  {
    name: "sum a string's code points in a `while` loop (`\"abc\"` => 97+98+99 = 294)",
    src: [
      "function main(): i32 {",
      '  let s = "abc"',
      "  let sum = 0",
      "  let i = 0",
      "  while i < s.length {",
      "    sum = sum + s[i]",
      "    i = i + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 294) throw new Error(`main() returned ${got}, expected 294`);
    },
  },
  {
    name: "a string passed INTO a helper, indexed through the param => 100",
    src: [
      "function firstCp(s: string): i32 {",
      "  return s[0]",
      "}",
      "function main(): i32 {",
      '  let g = "dog"',
      "  return firstCp(g)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 'd' is U+0064 = 100.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 100) throw new Error(`main() returned ${got}, expected 100`);
    },
  },
  {
    name: "a string returned from a helper, then `.length` read => 5",
    src: [
      "function greet(): string {",
      '  return "hello"',
      "}",
      "function main(): i32 {",
      "  let s = greet()",
      "  return s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  // ── discriminated unions + `is`-narrowing (G1) ─────────────────────────────
  // A `type N = A | B | …` union alias lowers to the BOXED tagged-struct rep
  // (mirroring `toWasm.ts`/`docs/unions.md`): a union VALUE is a `{ tag: i32, value:
  // anyref }` box wrapping the variant payload struct; `is A` is a box-tag compare;
  // a narrowed field read `n.f` (inside `if n is A`) recovers + `ref.cast`s the
  // payload then `struct.get`s the field. These prove real `WebAssembly.instantiate`
  // over the VL-emitted GC bytes — source → arena → bytes → engine — for construction,
  // discrimination, narrowing, and union values across locals/params/returns. Variant
  // structs are NOT directly JS-callable (they ride in a `(ref $box)`), so the proofs
  // construct + discriminate internally and return i32s.
  {
    name: "construct a variant, `is`-narrow it, read a variant field => 7",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function f(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  return 0",
      "}",
      "function mkA(x: i32): Node {",
      "  return { av: x }",
      "}",
      "function main(): i32 {",
      "  return f(mkA(7))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name: "a false `is` takes the other branch (B value through `is A` => 0)",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function f(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  return 99",
      "}",
      "function mkB(x: i32): Node {",
      "  return { bv: x }",
      "}",
      "function main(): i32 {",
      "  return f(mkB(5))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // `mkB(5)` is tagged B, so `is A` is false and the function returns 99.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 99) throw new Error(`main() returned ${got}, expected 99`);
    },
  },
  {
    name: "two variants discriminated, each reads its own field (7 + 9 => 16)",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function val(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  if n is B { return n.bv }",
      "  return 0",
      "}",
      "function mkA(x: i32): Node {",
      "  return { av: x }",
      "}",
      "function mkB(x: i32): Node {",
      "  return { bv: x }",
      "}",
      "function main(): i32 {",
      "  return val(mkA(7)) + val(mkB(9))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 16) throw new Error(`main() returned ${got}, expected 16`);
    },
  },
  {
    name: "a 3-variant union dispatches to the right arm (C => 300)",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type C = { cv: i32 }",
      "type Node = A | B | C",
      "function tag(n: Node): i32 {",
      "  if n is A { return 100 }",
      "  if n is B { return 200 }",
      "  if n is C { return 300 }",
      "  return 0",
      "}",
      "function mkC(x: i32): Node {",
      "  return { cv: x }",
      "}",
      "function main(): i32 {",
      "  return tag(mkC(1))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 300) throw new Error(`main() returned ${got}, expected 300`);
    },
  },
  {
    name: "a multi-field variant reads both fields after narrowing (3 + 4 => 7)",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32, bw: i32 }",
      "type Node = A | B",
      "function sumB(n: Node): i32 {",
      "  if n is B { return n.bv + n.bw }",
      "  return 0",
      "}",
      "function mkB(p: i32, q: i32): Node {",
      "  return { bv: p, bw: q }",
      "}",
      "function main(): i32 {",
      "  return sumB(mkB(3, 4))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name: "a union value stored in a local, then discriminated => 42",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function f(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  let n: Node = { av: 42 }",
      "  return f(n)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
    },
  },
  {
    name: "a union local discriminated in the SAME function (no helper) => 8",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function main(): i32 {",
      "  let n: Node = { bv: 8 }",
      "  if n is B { return n.bv }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 8) throw new Error(`main() returned ${got}, expected 8`);
    },
  },
];

// The combined driver: shared `loadToks` glue + a per-case runner that RESETS the
// parser arena (`P`) and ALL emitter module state (`W.bytes`, `fnNames`,
// `fnIndices`, `localNames`) before each case, lexes/parses/emits, and prints the
// result prefixed with `<key>\t`. `emitProgram` also self-resets `emitErr`, but the
// explicit resets here guarantee each case starts as if freshly loaded.
const driver = `
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
function runCase(key: string, src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  W.bytes = []
  fnNames = []
  fnIndices = []
  localNames = []
  loadToks(src)
  let root = parseProgram()
  let rc = emitProgram(root)
  if rc < 0 {
    print(key + "\\terr: " + emitErr)
  } else {
    print(key + "\\tmain: " + bytesToStr())
  }
  0
}
` +
  CASES.map((c, i) => `runCase("c${i}", ${JSON.stringify(c.src)})`).join("\n") +
  "\n";

// Compile + run the combined module ONCE (memoized); return the per-key logs.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit + "\n" +
      driver;
    const { wasm, diagnostics } = await compileCached(source);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted emit-program driver failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byKey = new Map<string, string[]>();
    for (const line of logs) {
      const tab = line.indexOf("\t");
      const key = tab < 0 ? "" : line.slice(0, tab);
      const payload = tab < 0 ? line : line.slice(tab + 1);
      const arr = byKey.get(key) ?? [];
      arr.push(payload);
      byKey.set(key, arr);
    }
    return byKey;
  })();

CASES.forEach((c, i) => {
  Deno.test(`self-hosted emit-program: ${c.name}`, async () => {
    const logs = (await runAll()).get(`c${i}`) ?? [];
    await c.check(logs);
  });
});

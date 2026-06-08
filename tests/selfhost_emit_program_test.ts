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

// Instantiate ONCE and return a caller bound to that single instance, so calls
// SHARE module state (mutable globals persist across them) — needed to OBSERVE a
// short-circuited side effect (a global a skipped helper would have written).
const instanceOf = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<(name: string, ...args: number[]) => number> => {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  return (name: string, ...args: number[]): number => {
    const fn = instance.exports[name] as (...a: number[]) => number;
    return fn(...args);
  };
};

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
    // `??` outside a map index get still fails loudly — keeps the "garbage bytes are
    // never emitted for an unsupported operator" coverage now that `/` and `%` are
    // genuine i32 operators (see the div/rem cases below).
    name: "an unsupported operator shape fails loudly, not with garbage bytes",
    src: "function bad(a: i32): i32 {\n  return a ?? 2\n}\n",
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the unsupported shape; got ${
            JSON.stringify(logs)
          }`,
        );
      }
      if (!errLine.includes("??") && !errLine.includes("operator")) {
        throw new Error(`unexpected emitter error message: ${errLine}`);
      }
    },
  },
  {
    // VL functions IMPLICITLY return their last expression (no `return` keyword) — the
    // idiom every `ast.vl` constructor uses (`addNode(n)` / `out` as the final line).
    // emitProgram now lowers a trailing bare value-expression statement as the return.
    name: "implicit return: a trailing bare expression is the return value (`n + 1`)",
    src: "function f(n: i32): i32 {\n  n + 1\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f", 41);
      if (got !== 42) throw new Error(`f(41) returned ${got}, expected 42`);
    },
  },
  {
    name: "implicit return: a trailing local reference (`let s = a+b; s`)",
    src:
      "function g(a: i32, b: i32): i32 {\n  let s = a + b\n  s\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "g", 20, 22);
      if (got !== 42) throw new Error(`g(20, 22) returned ${got}, expected 42`);
    },
  },
  {
    name:
      "implicit return: an explicit early `return` then a trailing implicit one => 84",
    src:
      "function h(n: i32): i32 {\n  if n < 0 { return 0 }\n  n * 2\n}\n",
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const pos = await runExport(bytes, "h", 42);
      if (pos !== 84) throw new Error(`h(42) returned ${pos}, expected 84`);
      const neg = await runExport(bytes, "h", -1);
      if (neg !== 0) throw new Error(`h(-1) returned ${neg}, expected 0`);
    },
  },
  {
    name: "implicit return: a trailing value-returning CALL (`addOne(n)`)",
    src:
      "function addOne(x: i32): i32 {\n  x + 1\n}\nfunction f(n: i32): i32 {\n  addOne(n)\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f", 9);
      if (got !== 10) throw new Error(`f(9) returned ${got}, expected 10`);
    },
  },
  {
    // A function whose body ENDS in an `if/else` where both arms `return` falls
    // through (structurally) to the function `end` with an empty stack. emitProgram
    // now emits an `unreachable` before the `end` so the module validates; the arms'
    // `return`s do the real work.
    name: "if/else both-arms-return as the body tail validates (`>0 ? 1 : 2`)",
    src: [
      "function f(n: i32): i32 {",
      "  if n > 0 {",
      "    return 1",
      "  } else {",
      "    return 2",
      "  }",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const pos = await runExport(bytes, "f", 5);
      if (pos !== 1) throw new Error(`f(5) returned ${pos}, expected 1`);
      const nonpos = await runExport(bytes, "f", -5);
      if (nonpos !== 2) throw new Error(`f(-5) returned ${nonpos}, expected 2`);
    },
  },
  {
    name: "else-if chain as the body tail (all arms return) => 3/2/1",
    src: [
      "function f(n: i32): i32 {",
      "  if n > 10 {",
      "    return 3",
      "  } else if n > 5 {",
      "    return 2",
      "  } else {",
      "    return 1",
      "  }",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      if (await runExport(bytes, "f", 20) !== 3) throw new Error("f(20) != 3");
      if (await runExport(bytes, "f", 7) !== 2) throw new Error("f(7) != 2");
      if (await runExport(bytes, "f", 1) !== 1) throw new Error("f(1) != 1");
    },
  },
  {
    // The REAL `i32ToStr` + `digitChar` from the self-host front end (`ast.vl`),
    // verbatim. It exercises `/`, `%`, the implicit return, string `+`, a `while`
    // loop, and string-returning helpers all at once — and now compiles + runs
    // end-to-end through the real lexer→parser→emitProgram pipeline. `main` calls it
    // on -405 and folds the result string's code points so the proof is an i32:
    // "-405" → '-'(45)+'4'(52)+'0'(48)+'5'(53) = 198, length 4 → 198*100+4 = 19804.
    name: "ast.vl's REAL `i32ToStr(-405)` compiles + runs (code-point fold => 19804)",
    src: [
      "function digitChar(d: i32): string {",
      '  if d == 0 { return "0" }',
      '  if d == 1 { return "1" }',
      '  if d == 2 { return "2" }',
      '  if d == 3 { return "3" }',
      '  if d == 4 { return "4" }',
      '  if d == 5 { return "5" }',
      '  if d == 6 { return "6" }',
      '  if d == 7 { return "7" }',
      '  if d == 8 { return "8" }',
      '  "9"',
      "}",
      "function i32ToStr(n: i32): string {",
      '  if n == 0 { return "0" }',
      "  let neg = n < 0",
      "  let m = n",
      "  if neg { m = 0 - m }",
      '  let out = ""',
      "  while m > 0 {",
      "    out = digitChar(m % 10) + out",
      "    m = m / 10",
      "  }",
      '  if neg { out = "-" + out }',
      "  out",
      "}",
      "function main(): i32 {",
      "  let s = i32ToStr(-405)",
      "  let sum = 0",
      "  let i = 0",
      "  while i < s.length {",
      "    sum = sum + s[i]",
      "    i = i + 1",
      "  }",
      "  return sum * 100 + s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 19804) {
        throw new Error(`main() returned ${got}, expected 19804`);
      }
    },
  },
  {
    name: "`/` lowers to i32.div_s (`a / b`): 17 / 5 => 3 (truncating)",
    src: "function divv(a: i32, b: i32): i32 {\n  return a / b\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "divv", 17, 5);
      if (got !== 3) throw new Error(`divv(17, 5) returned ${got}, expected 3`);
    },
  },
  {
    name: "`%` lowers to i32.rem_s (`a % b`): 17 % 5 => 2",
    src: "function modv(a: i32, b: i32): i32 {\n  return a % b\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "modv", 17, 5);
      if (got !== 2) throw new Error(`modv(17, 5) returned ${got}, expected 2`);
    },
  },
  {
    name: "`/` and `%` combine — `(a / b) * b + a % b` reconstructs a => 17",
    src:
      "function f(a: i32, b: i32): i32 {\n  return (a / b) * b + a % b\n}\n",
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f", 17, 5);
      if (got !== 17) throw new Error(`f(17, 5) returned ${got}, expected 17`);
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
    // The self-host front end (`ast.vl`) declares every `type` over SEVERAL lines
    // with a trailing comma. The parser now skips the NEWLINE tokens inside a braced
    // field list, so a multiline + trailing-comma struct decl parses and lowers the
    // same as the single-line form. Drives the real lexer→parser→emitProgram path.
    name: "a MULTILINE struct decl with a trailing comma parses + lowers (`p.x+p.y` => 30)",
    src: [
      "type P = {",
      "  x: i32,",
      "  y: i32,",
      "}",
      "function main(): i32 {",
      "  let p: P = { x: 10, y: 20 }",
      "  return p.x + p.y",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 30) throw new Error(`main() returned ${got}, expected 30`);
    },
  },
  {
    // `ast.vl`'s `Node` union spans 28 lines with each `|` at the start of a line.
    // The parser now skips NEWLINEs around the `|` separators in a union-variant
    // list, so a multiline union alias discriminates the same as the single-line form.
    name: "a MULTILINE union alias (`A |\\n B`) parses + `is`-narrows => 7",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A |",
      "  B",
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
      if (!errLine.includes("struct fields are supported")) {
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
  // Concatenation (`+`), value-equality (`==`/`!=`), and `.slice` land in G6 (the
  // block below). `.indexOf`/`.includes`/`.charCodeAt`/`fromCodePoint` and the UTF-8
  // `array i8` storage migration (B7) remain DEFERRED — out of scope for this slice.
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
  // ── string `+` / `==`/`!=` / `.slice` (G6) ──────────────────────────────────
  // A string is the SAME `(array (mut i32))` of code points, so all three lower to
  // the array machinery INLINE (no helper functions): `+` allocates a new array of
  // `len(a)+len(b)` and `array.copy`s both operands in; `==`/`!=` are ELEMENT-WISE
  // value-equality (a length check then a per-code-point loop — NOT ref identity);
  // `.slice(start,end)` allocates a new array over the clamped half-open range and
  // `array.copy`s it. These are load-bearing for the self-host sources (diagnostics
  // build messages with `+`, the lexer keyword tables compare with `==`, lexeme
  // extraction uses `gSrc.slice(start, end)`). Each proves real `WebAssembly.
  // instantiate` over the VL-emitted GC bytes — source → arena → bytes → engine.
  {
    name: 'G6: `"ab" + "cd"` concatenates — `.length` => 4',
    src: [
      "function main(): i32 {",
      '  let s = "ab" + "cd"',
      "  return s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 4) throw new Error(`main() returned ${got}, expected 4`);
    },
  },
  {
    name: 'G6: `"ab" + "cd"` — index checks (s[0]=a, s[2]=c, s[3]=d)',
    src: [
      "function main(): i32 {",
      '  let s = "ab" + "cd"',
      // 'a'=97, 'c'=99, 'd'=100 → 97 + 99 + 100 = 296
      "  return s[0] + s[2] + s[3]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 296) throw new Error(`main() returned ${got}, expected 296`);
    },
  },
  {
    name: "G6: concat of two string LOCALS (`a + b`) => length 5",
    src: [
      "function main(): i32 {",
      '  let a = "ab"',
      '  let b = "cde"',
      "  let c = a + b",
      "  return c.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    name: "G6: `==` value-equality of SAME content (`\"foo\" == \"foo\"` => 1)",
    src: [
      "function main(): i32 {",
      '  if "foo" == "foo" {',
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name:
      "G6: `==` of DIFFERENT content, SAME length (`\"foo\" == \"bar\"` => 0)",
    src: [
      "function main(): i32 {",
      '  if "foo" == "bar" {',
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 0) throw new Error(`main() returned ${got}, expected 0`);
    },
  },
  {
    name: "G6: `==` of DIFFERENT length (`\"ab\" == \"abc\"` => 0)",
    src: [
      "function main(): i32 {",
      '  if "ab" == "abc" {',
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 0) throw new Error(`main() returned ${got}, expected 0`);
    },
  },
  {
    name:
      "G6: `==` is VALUE equality, not ref identity — two BUILT-UP strings compare equal",
    src: [
      "function main(): i32 {",
      // `"ab"+"cd"` and `"ab"+"cd"` are distinct array refs but equal content.
      '  let a = "ab" + "cd"',
      '  let b = "ab" + "cd"',
      "  if a == b {",
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: "G6: `!=` negates value-equality (equal => 0, unequal => 1, summed => 1)",
    src: [
      "function main(): i32 {",
      "  let x = 0",
      '  if "foo" != "foo" {',
      "    x = x + 10",
      "  }",
      '  if "foo" != "bar" {',
      "    x = x + 1",
      "  }",
      "  return x",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: 'G6: `.slice(1, 3)` of `"hello"` yields `"el"` — compared with `==` => 1',
    src: [
      "function main(): i32 {",
      '  if "hello".slice(1, 3) == "el" {',
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: 'G6: `.slice(1, 3)` — `.length` => 2, and indices (s[0]=e=101, s[1]=l=108)',
    src: [
      "function main(): i32 {",
      '  let s = "hello".slice(1, 3)',
      // length 2; s[0]='e'=101, s[1]='l'=108 → 2 + 101 + 108 = 211
      "  return s.length + s[0] + s[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 211) throw new Error(`main() returned ${got}, expected 211`);
    },
  },
  {
    name: "G6: `.slice` clamps an out-of-range end (`\"hi\".slice(0, 99)` => length 2)",
    src: [
      "function main(): i32 {",
      '  let s = "hi".slice(0, 99)',
      "  return s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 2) throw new Error(`main() returned ${got}, expected 2`);
    },
  },
  {
    name:
      "G6: keyword-table dispatch — `if word == \"let\"` selects the right arm => 7",
    src: [
      "function classify(word: string): i32 {",
      '  if word == "let" {',
      "    return 7",
      "  }",
      '  if word == "const" {',
      "    return 9",
      "  }",
      "  return 0",
      "}",
      "function main(): i32 {",
      '  return classify("let")',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name:
      "G6: keyword-table dispatch — a NON-keyword falls through to the default => 0",
    src: [
      "function classify(word: string): i32 {",
      '  if word == "let" {',
      "    return 7",
      "  }",
      '  if word == "const" {',
      "    return 9",
      "  }",
      "  return 0",
      "}",
      "function main(): i32 {",
      '  return classify("xyz")',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 0) throw new Error(`main() returned ${got}, expected 0`);
    },
  },
  {
    name: "G6: a string concat built in a `while` loop (3 iterations => length 6)",
    src: [
      "function main(): i32 {",
      '  let s = ""',
      "  let i = 0",
      "  while i < 3 {",
      '    s = s + "ab"',
      "    i = i + 1",
      "  }",
      "  return s.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 6) throw new Error(`main() returned ${got}, expected 6`);
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

  // ── G2a: struct field WRITE (`s.field = v` → struct.set) ────────────────────
  {
    name: "G2a: write a struct field then read it back (`p.x = 5; p.x` => 5)",
    src: [
      "type Point = { x: i32, y: i32 }",
      "function main(): i32 {",
      "  let p: Point = { x: 0, y: 0 }",
      "  p.x = 5",
      "  return p.x",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    name:
      "G2a: write both struct fields, read both back (`p.x=3; p.y=40` => 43)",
    src: [
      "type Point = { x: i32, y: i32 }",
      "function main(): i32 {",
      "  let p: Point = { x: 0, y: 0 }",
      "  p.x = 3",
      "  p.y = 40",
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
    name: "G2a: read-modify-write a field (`p.x = p.x + 10` => 17)",
    src: [
      "type Point = { x: i32, y: i32 }",
      "function bump(a: i32, b: i32): i32 {",
      "  let p: Point = { x: a, y: b }",
      "  p.x = p.x + 10",
      "  return p.x + p.y",
      "}",
      "function main(): i32 {",
      "  return bump(5, 2)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 17) throw new Error(`main() returned ${got}, expected 17`);
    },
  },
  {
    name: "G2a: mutate a struct field inside a `while` loop (sum 1..5 => 15)",
    src: [
      "type Acc = { total: i32, i: i32 }",
      "function main(): i32 {",
      "  let a: Acc = { total: 0, i: 1 }",
      "  while a.i <= 5 {",
      "    a.total = a.total + a.i",
      "    a.i = a.i + 1",
      "  }",
      "  return a.total",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 15) throw new Error(`main() returned ${got}, expected 15`);
    },
  },

  // ── G4 (arena keystone): MULTIPLE distinct struct types per program ─────────
  // `ast.vl` declares 32 struct `type`s; emitProgram now interns a SEPARATE WasmGC
  // struct heap type per declared `type`, dispatching construction / field read /
  // field write to the right heap index by the literal's field-set (or the binding's
  // annotation / param / return type). These prove two-plus distinct structs coexist,
  // each constructed + field-accessed, through real lexer→parser→emitProgram→engine.
  {
    name: "G4-struct: two distinct struct types coexist, each constructed + read => 12",
    src: [
      "type A = { x: i32, y: i32 }",
      "type B = { p: i32, q: i32, r: i32 }",
      "function main(): i32 {",
      "  let a = { x: 7, y: 9 }",
      "  let b = { p: 1, q: 2, r: 3 }",
      "  return a.y + b.r",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 12) throw new Error(`main() returned ${got}, expected 12`);
    },
  },
  {
    // Distinct structs with an OVERLAPPING-arity but distinct field-name set; a field
    // index that differs between the two (`A.b` is field 1, `C.b` is field 0) proves
    // the read resolves the per-struct layout, not a shared one.
    name: "G4-struct: same-arity structs with different field order resolve correctly => 50",
    src: [
      "type A = { a: i32, b: i32 }",
      "type C = { b: i32, c: i32 }",
      "function main(): i32 {",
      "  let x = { a: 10, b: 20 }",
      "  let y = { b: 4, c: 30 }",
      "  return x.b + y.c",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 50) throw new Error(`main() returned ${got}, expected 50`);
    },
  },
  {
    // A struct flows through a typed helper param + a struct-returning helper, each a
    // DIFFERENT struct type — the functype valtype + the field reads must each pick
    // the right heap index.
    name: "G4-struct: two struct types across helpers (param + return) => 30",
    src: [
      "type P = { x: i32, y: i32 }",
      "type Q = { m: i32, n: i32 }",
      "function mkQ(a: i32, b: i32): Q {",
      "  return { m: a, n: b }",
      "}",
      "function sumP(p: P): i32 {",
      "  return p.x + p.y",
      "}",
      "function main(): i32 {",
      "  let p = { x: 3, y: 7 }",
      "  let q = mkQ(8, 12)",
      "  return sumP(p) + q.m + q.n",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 30) throw new Error(`main() returned ${got}, expected 30`);
    },
  },
  {
    // Field WRITE across two struct types: each `s.f = v` must resolve to its own
    // struct's heap index + field index.
    name: "G4-struct: field writes across two struct types => 9",
    src: [
      "type A = { x: i32, y: i32 }",
      "type B = { p: i32, q: i32, r: i32 }",
      "function main(): i32 {",
      "  let a = { x: 0, y: 0 }",
      "  let b = { p: 0, q: 0, r: 0 }",
      "  a.y = 4",
      "  b.r = 5",
      "  return a.y + b.r",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 9) throw new Error(`main() returned ${got}, expected 9`);
    },
  },

  // ── G2-strfield: STRING struct fields (mixed i32 + string layout) ───────────
  // `ast.vl`'s `Tok`/`Diag` mix i32 + string fields. A string field lowers to a
  // non-null `(ref $aTypeIdx)` (the code-point array string rep); reading it back
  // surfaces a string ref that the G6 element-wise `==` can compare. These prove a
  // mixed-field struct constructs + round-trips a string field through the engine.
  {
    name: "G2-strfield: a Tok-like struct's string field reads back equal (`t.kind == \"id\"` => 1)",
    src: [
      "type Tok = { kind: string, start: i32, end: i32 }",
      "function main(): i32 {",
      "  let t: Tok = { kind: \"id\", start: 3, end: 7 }",
      "  if t.kind == \"id\" {",
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    // The string field is NOT the first field — a mixed layout where the i32 fields
    // surround the string field proves the field-type list, not a uniform assumption,
    // drives the struct shape + the per-field read typing.
    name: "G2-strfield: string field in the middle round-trips + i32 fields read => 11",
    src: [
      "type Tok = { start: i32, kind: string, end: i32 }",
      "function main(): i32 {",
      "  let t: Tok = { start: 4, kind: \"let\", end: 7 }",
      "  if t.kind == \"let\" {",
      "    return t.start + t.end",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 11) throw new Error(`main() returned ${got}, expected 11`);
    },
  },
  {
    // Bind the string field to a `let` then compare — proves local-type inference gives
    // the binding the string ref type (not i32), so the `==` typechecks + runs.
    name: "G2-strfield: bind a struct string field to a local, compare => 1",
    src: [
      "type Tok = { kind: string, n: i32 }",
      "function main(): i32 {",
      "  let t: Tok = { kind: \"num\", n: 5 }",
      "  let k = t.kind",
      "  if k == \"num\" {",
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    // A mixed i32+string struct WRITE: overwrite the string field, then read it back
    // and compare — proves the field-write operand typing accepts a string value.
    name: "G2-strfield: write a struct string field then read it back equal => 1",
    src: [
      "type Tok = { kind: string, n: i32 }",
      "function main(): i32 {",
      "  let t: Tok = { kind: \"a\", n: 0 }",
      "  t.kind = \"xyz\"",
      "  if t.kind == \"xyz\" {",
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },

  // ── G1-strfield: STRING fields on UNION variants ────────────────────────────
  // `ast.vl`'s `Node` union has variants with string fields (`NumLit = { numText:
  // string }`). A string variant field lowers to a non-null `(ref $aTypeIdx)` in the
  // variant struct; a narrowed read (`if n is A { … n.s … }`) surfaces the string ref
  // for the G6 `==`. Proves a mixed/string-field union variant constructs + reads back.
  {
    name: "G1-strfield: a union variant's string field reads back equal after narrowing => 1",
    src: [
      "type A = { numText: string }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function f(n: Node): i32 {",
      "  if n is A {",
      '    if n.numText == "42" { return 1 }',
      "    return 0",
      "  }",
      "  return 9",
      "}",
      "function main(): i32 {",
      '  return f({ numText: "42" })',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    // A union variant mixing an i32 + a string field, both read after narrowing.
    name: "G1-strfield: mixed i32+string union variant, both fields read => 8",
    src: [
      "type Tk = { tkKind: string, tkPos: i32 }",
      "type Other = { ov: i32 }",
      "type Node = Tk | Other",
      "function f(n: Node): i32 {",
      "  if n is Tk {",
      '    if n.tkKind == \"id\" { return n.tkPos }',
      "    return 0",
      "  }",
      "  return 99",
      "}",
      "function main(): i32 {",
      '  return f({ tkKind: \"id\", tkPos: 8 })',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 8) throw new Error(`main() returned ${got}, expected 8`);
    },
  },

  // ── G4-coexist: STANDALONE structs alongside a UNION (the ast.vl shape) ─────
  // `ast.vl` declares standalone structs (`Tok`, `Diag`, `Parser`) RIGHT ALONGSIDE
  // the `Node` discriminated union. emitProgram now interns the standalone structs
  // (those NOT union variants) as their own heap types AFTER the union's variants +
  // box, routing an object literal to the standalone struct when its field-set matches
  // one (else to the union box). These prove a mixed struct+union program — the core
  // arena shape — constructs + reads back through real lexer→parser→emitProgram→engine.
  {
    name: "G4-coexist: a standalone Tok struct coexists with a Node union, read its i32 field => 3",
    src: [
      "type Tok = { kind: string, pos: i32 }",
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function main(): i32 {",
      '  let t: Tok = { kind: "x", pos: 3 }',
      "  return t.pos",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    // Use BOTH the standalone struct (string field == + i32 field) AND the union
    // (`is`-narrow + variant field) in one function — proves the two paths coexist
    // and dispatch correctly within a single program.
    name: "G4-coexist: use a standalone struct + a union value in one program => 12",
    src: [
      "type Tok = { kind: string, pos: i32 }",
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function classify(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  return 0",
      "}",
      "function main(): i32 {",
      '  let t: Tok = { kind: "id", pos: 7 }',
      "  let c = classify({ av: 5 })",
      '  if t.kind == "id" { return t.pos + c }',
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 12) throw new Error(`main() returned ${got}, expected 12`);
    },
  },

  // ── G2b: module-level mutable GLOBALS (global.get / global.set) ─────────────
  {
    name: "G2b: an i32 global read+written within one function (`g=g+1` => 1)",
    src: [
      "let g = 0",
      "function inc(): i32 {",
      "  g = g + 1",
      "  return g",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "inc");
      if (got !== 1) throw new Error(`inc() returned ${got}, expected 1`);
    },
  },
  {
    name:
      "G2b: a global counter bumped by a helper, read by main, across calls => 3",
    src: [
      "let g = 0",
      "function bump(): i32 {",
      "  g = g + 1",
      "  return g",
      "}",
      "function main(): i32 {",
      "  bump()",
      "  bump()",
      "  bump()",
      "  return g",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    name:
      "G2b: two globals, one seeded non-zero (`a=10`), summed after a write => 17",
    src: [
      "let a = 10",
      "let b = 0",
      "function main(): i32 {",
      "  b = 7",
      "  return a + b",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 17) throw new Error(`main() returned ${got}, expected 17`);
    },
  },
  {
    name:
      "G2b: a module-level struct global, field-mutated then read back => 9",
    src: [
      "type Box = { v: i32 }",
      "let bx: Box = { v: 0 }",
      "function main(): i32 {",
      "  bx.v = 9",
      "  return bx.v",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 9) throw new Error(`main() returned ${got}, expected 9`);
    },
  },
  {
    name: "G2b: a module-level array global, indexed and `.length` read => 32",
    src: [
      "let xs: i32[] = [10, 20]",
      "function main(): i32 {",
      "  return xs[0] + xs[1] + xs.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // xs[0] + xs[1] + length = 10 + 20 + 2 = 32.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 32) throw new Error(`main() returned ${got}, expected 32`);
    },
  },
  // ── G7-ref: ref-element growable lists (arrays of structs / unions) ─────────
  // A growable list whose ELEMENT is a reference — `T[]` (a struct ref) or `N[]`
  // (the union box ref) — reuses the `{ backing, len, cap }` wrapper, but its backing
  // array slot is `(ref null $elem)` (nullable-widened so `array.new_default` defaults
  // spare slots to null); an index READ `array.get`s then `ref.as_non_null`s the slot
  // back to the non-null element. `.push`/index-set reuse the i32-list grow/store over
  // the ref backing. These prove real `WebAssembly.instantiate` over the VL-emitted GC
  // bytes — source → arena → bytes → engine — for the `Node[]`/`Tok[]` arena shapes.
  // (Struct/union lists ride in GC refs, so the proofs construct + read internally and
  // return i32s.)
  {
    name: "G7-ref: push structs onto a `T[]`, index a field + length => 18",
    src: [
      "type T = { v: i32 }",
      "function main(): i32 {",
      "  let xs: T[] = []",
      "  xs.push({ v: 7 })",
      "  xs.push({ v: 9 })",
      "  return xs[0].v + xs[1].v + xs.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 7 + 9 + 2 = 18.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 18) throw new Error(`main() returned ${got}, expected 18`);
    },
  },
  {
    name: "G7-ref: build a `T[]` in a `while` loop, then sum a field => 16",
    src: [
      "type T = { v: i32 }",
      "function main(): i32 {",
      "  let xs: T[] = []",
      "  let i = 0",
      "  while i < 4 {",
      "    xs.push({ v: i * 2 })",
      "    i = i + 1",
      "  }",
      "  let s = 0",
      "  let j = 0",
      "  while j < xs.length {",
      "    s = s + xs[j].v",
      "    j = j + 1",
      "  }",
      "  return s + xs.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // elements v = 0,2,4,6 → sum 12; + length 4 = 16.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 16) throw new Error(`main() returned ${got}, expected 16`);
    },
  },
  {
    name: "G7-ref: a `T[]` literal with elements, then index + length => 25",
    src: [
      "type T = { v: i32 }",
      "function main(): i32 {",
      "  let xs: T[] = [{ v: 10 }, { v: 13 }]",
      "  return xs[0].v + xs[1].v + xs.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 10 + 13 + 2 = 25.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 25) throw new Error(`main() returned ${got}, expected 25`);
    },
  },
  {
    name: "G7-ref: index-set a `T[]` element field, read it back => 42",
    src: [
      "type T = { v: i32 }",
      "function main(): i32 {",
      "  let xs: T[] = []",
      "  xs.push({ v: 1 })",
      "  xs[0] = { v: 42 }",
      "  return xs[0].v",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 42) throw new Error(`main() returned ${got}, expected 42`);
    },
  },
  {
    name:
      "G7-ref: push two union variants onto `N[]`, index one + `is`-narrow => 7",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type N = A | B",
      "function main(): i32 {",
      "  let ns: N[] = []",
      "  ns.push({ av: 5 })",
      "  ns.push({ bv: 8 })",
      "  let n0 = ns[0]",
      "  let r = 0",
      "  if n0 is A { r = n0.av }",
      "  return r + ns.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // n0 is A → r = 5; + length 2 = 7.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    name:
      "G7-ref: `N[]` arena — push A & B, narrow each element to read its field => 17",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type N = A | B",
      "function main(): i32 {",
      "  let ns: N[] = []",
      "  ns.push({ av: 9 })",
      "  ns.push({ bv: 8 })",
      "  let s = 0",
      "  let i = 0",
      "  while i < ns.length {",
      "    let n = ns[i]",
      "    if n is A { s = s + n.av }",
      "    if n is B { s = s + n.bv }",
      "    i = i + 1",
      "  }",
      "  return s",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // A.av 9 + B.bv 8 = 17.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 17) throw new Error(`main() returned ${got}, expected 17`);
    },
  },
  // ── G3: boolean params/locals/returns + BoolLit/CharLit ─────────────────────
  // `boolean` rides in an i32 (true=1 / false=0), so it reuses the i32 valtype (0x7f)
  // everywhere — boolean params/locals/returns are i32 slots, `BoolLit` lowers to
  // `i32.const 1`/`0`, and `CharLit` to `i32.const <code point>`. These prove real
  // `WebAssembly.instantiate` over the VL-emitted bytes — source → arena → bytes →
  // engine — and the correct runtime VALUES (true=1, false=0, char code correct).
  {
    name: "G3: a `boolean` param is returned (true => 1, false => 0)",
    src: [
      "function id(b: boolean): boolean {",
      "  return b",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const t = await runExport(bytes, "id", 1);
      if (t !== 1) throw new Error(`id(true) returned ${t}, expected 1`);
      const f = await runExport(bytes, "id", 0);
      if (f !== 0) throw new Error(`id(false) returned ${f}, expected 0`);
    },
  },
  {
    name: "G3: a `BoolLit` condition (`if true { return 1 }`) => 1",
    src: [
      "function main(): i32 {",
      "  if true { return 1 }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: "G3: `false` in a condition takes the other branch => 9",
    src: [
      "function main(): i32 {",
      "  if false { return 0 }",
      "  return 9",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 9) throw new Error(`main() returned ${got}, expected 9`);
    },
  },
  {
    name: "G3: a function returning `boolean` (a comparison) => 1",
    src: [
      "function gt(a: i32, b: i32): boolean {",
      "  return a > b",
      "}",
      "function main(): i32 {",
      "  if gt(5, 3) { return 1 }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const main = await runMain(bytes);
      if (main !== 1) throw new Error(`main() returned ${main}, expected 1`);
      const t = await runExport(bytes, "gt", 5, 3);
      if (t !== 1) throw new Error(`gt(5, 3) returned ${t}, expected 1`);
      const f = await runExport(bytes, "gt", 2, 8);
      if (f !== 0) throw new Error(`gt(2, 8) returned ${f}, expected 0`);
    },
  },
  {
    name: "G3: a `boolean` local drives an `if`, then is returned => 1",
    src: [
      "function main(): i32 {",
      "  let ok: boolean = true",
      "  if ok { return 1 }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: "G3: a `CharLit` (`'a'`) lowers to its code point => 97",
    src: [
      "function main(): i32 {",
      "  return 'a'",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 97) throw new Error(`main() returned ${got}, expected 97`);
    },
  },
  {
    name: "G3: a `CharLit` local + arithmetic (`'A' + 1` => 66)",
    src: [
      "function main(): i32 {",
      "  let c = 'A'",
      "  return c + 1",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 'A' is U+0041 = 65, + 1 = 66.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 66) throw new Error(`main() returned ${got}, expected 66`);
    },
  },

  // ── G4: logical `&&` / `||` / `!` via the first VALUE-TYPED `if` ─────────────
  // `&&`/`||` are short-circuit EXPRESSIONS that yield an i32, so they lower to an
  // `if` with an i32 RESULT-TYPE blocktype `0x7f` (both arms leave one i32):
  //   `a && b` ≡ if(a){b}else{0},  `a || b` ≡ if(a){1}else{b}.
  // `!a` is `i32.eqz` (0x45). These prove real `WebAssembly.instantiate` over the
  // VL-emitted bytes AND the correct truth-table + short-circuit (skip) semantics.
  {
    name: "G4: `a && b` truth table (1&1=1, 1&0=0, 0&1=0, 0&0=0)",
    src: [
      "function and(a: boolean, b: boolean): boolean {",
      "  return a && b",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const tt = await runExport(bytes, "and", 1, 1);
      if (tt !== 1) throw new Error(`and(1,1) returned ${tt}, expected 1`);
      const tf = await runExport(bytes, "and", 1, 0);
      if (tf !== 0) throw new Error(`and(1,0) returned ${tf}, expected 0`);
      const ft = await runExport(bytes, "and", 0, 1);
      if (ft !== 0) throw new Error(`and(0,1) returned ${ft}, expected 0`);
      const ff = await runExport(bytes, "and", 0, 0);
      if (ff !== 0) throw new Error(`and(0,0) returned ${ff}, expected 0`);
    },
  },
  {
    name: "G4: `a || b` truth table (1|1=1, 1|0=1, 0|1=1, 0|0=0)",
    src: [
      "function or(a: boolean, b: boolean): boolean {",
      "  return a || b",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const tt = await runExport(bytes, "or", 1, 1);
      if (tt !== 1) throw new Error(`or(1,1) returned ${tt}, expected 1`);
      const tf = await runExport(bytes, "or", 1, 0);
      if (tf !== 1) throw new Error(`or(1,0) returned ${tf}, expected 1`);
      const ft = await runExport(bytes, "or", 0, 1);
      if (ft !== 1) throw new Error(`or(0,1) returned ${ft}, expected 1`);
      const ff = await runExport(bytes, "or", 0, 0);
      if (ff !== 0) throw new Error(`or(0,0) returned ${ff}, expected 0`);
    },
  },
  {
    name: "G4: `!a` logical not via i32.eqz (!0=1, !1=0)",
    src: [
      "function not(a: boolean): boolean {",
      "  return !a",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const n0 = await runExport(bytes, "not", 0);
      if (n0 !== 1) throw new Error(`not(0) returned ${n0}, expected 1`);
      const n1 = await runExport(bytes, "not", 1);
      if (n1 !== 0) throw new Error(`not(1) returned ${n1}, expected 0`);
    },
  },
  {
    name: "G4: `&&` SHORT-CIRCUITS the RHS — false LHS skips the call (global stays 0)",
    src: [
      // `mark()` records that it ran by setting `hit`; in `a && mark()` it must be
      // SKIPPED when `a` is false. After `test(false)` the global `hit` is still 0.
      "let hit = 0",
      "function mark(): boolean {",
      "  hit = 1",
      "  return true",
      "}",
      "function test(a: boolean): boolean {",
      "  return a && mark()",
      "}",
      "function probe(): i32 {",
      "  return hit",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // ONE shared instance so the global `hit` persists across calls.
      const call = await instanceOf(bytesFromLog(logs));
      // a = false: RHS `mark()` must be skipped → result 0 AND `hit` untouched.
      const r = call("test", 0);
      if (r !== 0) throw new Error(`test(false) returned ${r}, expected 0`);
      const skipped = call("probe");
      if (skipped !== 0) {
        throw new Error(`&& did not short-circuit: hit=${skipped}, expected 0`);
      }
      // a = true: RHS runs → result 1 AND `hit` becomes 1.
      const r2 = call("test", 1);
      if (r2 !== 1) throw new Error(`test(true) returned ${r2}, expected 1`);
      const ran = call("probe");
      if (ran !== 1) throw new Error(`&& did not run RHS: hit=${ran}, expected 1`);
    },
  },
  {
    name: "G4: `||` SHORT-CIRCUITS the RHS — true LHS skips the call (global stays 0)",
    src: [
      "let hit = 0",
      "function mark(): boolean {",
      "  hit = 1",
      "  return false",
      "}",
      "function test(a: boolean): boolean {",
      "  return a || mark()",
      "}",
      "function probe(): i32 {",
      "  return hit",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // ONE shared instance so the global `hit` persists across calls.
      const call = await instanceOf(bytesFromLog(logs));
      // a = true: RHS `mark()` must be skipped → result 1 AND `hit` untouched.
      const r = call("test", 1);
      if (r !== 1) throw new Error(`test(true) returned ${r}, expected 1`);
      const skipped = call("probe");
      if (skipped !== 0) {
        throw new Error(`|| did not short-circuit: hit=${skipped}, expected 0`);
      }
      // a = false: RHS runs → result 0 AND `hit` becomes 1.
      const r2 = call("test", 0);
      if (r2 !== 0) throw new Error(`test(false) returned ${r2}, expected 0`);
      const ran = call("probe");
      if (ran !== 1) throw new Error(`|| did not run RHS: hit=${ran}, expected 1`);
    },
  },
  {
    name: "G4: char-class predicate `(x > 0) && (x < 10)` drives a branch",
    src: [
      // The lexer-style combined predicate: a value-typed `&&` of two comparisons,
      // driving a (void statement) `if` — exactly the char-class shape G4 unblocks.
      "function inRange(x: i32): i32 {",
      "  if (x > 0) && (x < 10) {",
      "    return 1",
      "  }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const inside = await runExport(bytes, "inRange", 5);
      if (inside !== 1) throw new Error(`inRange(5) returned ${inside}, expected 1`);
      const low = await runExport(bytes, "inRange", 0);
      if (low !== 0) throw new Error(`inRange(0) returned ${low}, expected 0`);
      const high = await runExport(bytes, "inRange", 10);
      if (high !== 0) throw new Error(`inRange(10) returned ${high}, expected 0`);
      const neg = await runExport(bytes, "inRange", -3);
      if (neg !== 0) throw new Error(`inRange(-3) returned ${neg}, expected 0`);
    },
  },
  {
    name: "G4: combined `!(a && b) || c` exercises all three operators",
    src: [
      "function f(a: boolean, b: boolean, c: boolean): boolean {",
      "  return !(a && b) || c",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      // !(a&&b) || c.  a=1,b=1,c=0 → !(1)||0 = 0||0 = 0.
      const r1 = await runExport(bytes, "f", 1, 1, 0);
      if (r1 !== 0) throw new Error(`f(1,1,0) returned ${r1}, expected 0`);
      // a=1,b=1,c=1 → !(1)||1 = 0||1 = 1.
      const r2 = await runExport(bytes, "f", 1, 1, 1);
      if (r2 !== 1) throw new Error(`f(1,1,1) returned ${r2}, expected 1`);
      // a=1,b=0,c=0 → !(0)||0 = 1||0 = 1.
      const r3 = await runExport(bytes, "f", 1, 0, 0);
      if (r3 !== 1) throw new Error(`f(1,0,0) returned ${r3}, expected 1`);
    },
  },
  {
    name: "G8: empty map, set then get (`m[\"a\"]=1; m[\"a\"] ?? -1` => 1)",
    src: [
      "function main(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 1',
      '  return m["a"] ?? -1',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
    },
  },
  {
    name: "G8: two distinct keys both round-trip (`a`=>1, `b`=>2, sum => 3)",
    src: [
      "function main(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 1',
      '  m["b"] = 2',
      '  let x = m["a"] ?? -1',
      '  let y = m["b"] ?? -1',
      "  return x + y",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    name: "G8: overwriting a key updates in place (`m[\"a\"]=1; m[\"a\"]=2` => 2)",
    src: [
      "function main(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 1',
      '  m["a"] = 2',
      '  return m["a"] ?? -1',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 2) throw new Error(`main() returned ${got}, expected 2`);
    },
  },
  {
    name: "G8: a missing key falls back to the `??` default (`m[\"z\"] ?? 99` => 99)",
    src: [
      "function main(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 1',
      '  return m["z"] ?? 99',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 99) throw new Error(`main() returned ${got}, expected 99`);
    },
  },
  {
    name: "G8: `.has(k)` is 1 for a present key and 0 for an absent one",
    src: [
      "function present(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 5',
      '  if m.has("a") { return 1 }',
      "  return 0",
      "}",
      "function absent(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["a"] = 5',
      '  if m.has("b") { return 1 }',
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const bytes = bytesFromLog(logs);
      const p = await runExport(bytes, "present");
      if (p !== 1) throw new Error(`present() returned ${p}, expected 1`);
      const a = await runExport(bytes, "absent");
      if (a !== 0) throw new Error(`absent() returned ${a}, expected 0`);
    },
  },
  {
    name:
      "G8: scope-chain pattern — several string->i32 bindings, set then looked up via has+get",
    src: [
      // Mirrors `typecheck.vl`'s scope map: declare bindings, then look one up the way",
      // `lookup` does — `if m.has(name) { return m[name] ?? -1 }`.
      "function lookup(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["x"] = 10',
      '  m["y"] = 20',
      '  m["z"] = 30',
      '  m["y"] = 25',
      '  if m.has("y") { return m["y"] ?? -1 }',
      "  return -1",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // x,y,z bound; y overwritten 20→25; has("y") true → m["y"] = 25.
      const got = await runExport(bytesFromLog(logs), "lookup");
      if (got !== 25) throw new Error(`lookup() returned ${got}, expected 25`);
    },
  },
  {
    // PROVES the open-addressing RESIZE/REHASH path: cap 8, load-factor 1/2 grows
    // at the 4th entry (and again at the 8th), so inserting 10 keys forces TWO
    // rehashes. Every key is then looked up — if a rehash dropped/mis-placed any
    // entry (or the probe couldn't find a free slot post-grow), the sum is wrong.
    // Values 1..10 sum to 55.
    name: "G8: ten keys force two index resizes; every key still round-trips (sum => 55)",
    src: [
      "function manykeys(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["k0"] = 1',
      '  m["k1"] = 2',
      '  m["k2"] = 3',
      '  m["k3"] = 4',
      '  m["k4"] = 5',
      '  m["k5"] = 6',
      '  m["k6"] = 7',
      '  m["k7"] = 8',
      '  m["k8"] = 9',
      '  m["k9"] = 10',
      "  let sum = 0",
      '  sum = sum + (m["k0"] ?? -1)',
      '  sum = sum + (m["k1"] ?? -1)',
      '  sum = sum + (m["k2"] ?? -1)',
      '  sum = sum + (m["k3"] ?? -1)',
      '  sum = sum + (m["k4"] ?? -1)',
      '  sum = sum + (m["k5"] ?? -1)',
      '  sum = sum + (m["k6"] ?? -1)',
      '  sum = sum + (m["k7"] ?? -1)',
      '  sum = sum + (m["k8"] ?? -1)',
      '  sum = sum + (m["k9"] ?? -1)',
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "manykeys");
      if (got !== 55) throw new Error(`manykeys() returned ${got}, expected 55`);
    },
  },
  {
    // Resize interleaved with OVERWRITES and a MISSING-key probe: grow the map past
    // its initial cap while overwriting some keys, then confirm overwrites stuck,
    // an absent key still misses (the post-resize probe terminates on a free slot),
    // and `.has` agrees. k3 overwritten 4→40; k7 overwritten 8→80; absent "nope".
    name: "G8: resize with interleaved overwrites + a missing-key probe",
    src: [
      "function f(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["k0"] = 1',
      '  m["k1"] = 2',
      '  m["k2"] = 3',
      '  m["k3"] = 4',
      '  m["k4"] = 5',
      '  m["k5"] = 6',
      '  m["k6"] = 7',
      '  m["k7"] = 8',
      '  m["k3"] = 40',
      '  m["k7"] = 80',
      "  let r = 0",
      '  r = r + (m["k3"] ?? -1)',
      '  r = r + (m["k7"] ?? -1)',
      '  r = r + (m["k0"] ?? -1)',
      '  r = r + (m["nope"] ?? 1000)',
      '  if m.has("k5") { r = r + 1 }',
      '  if m.has("nope") { r = r + 100000 }',
      "  return r",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 40 + 80 + 1 + 1000 (default for missing) + 1 (has k5) = 1122.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 1122) throw new Error(`f() returned ${got}, expected 1122`);
    },
  },
  // ── G5: array-typed struct / union-variant fields ──────────────────────────
  // A struct field whose type is `i32[]` stores a REF to the growable i32-list wrapper
  // (`(ref $lTypeIdx)`) — the same wrapper an `i32[]` local/param uses. Construction
  // assigns the list, a field read `b.items` yields the list ref (so `.length` /
  // indexing work), and a field write `b.items = …` stores a new list ref.
  {
    name: "G5: struct with an `i32[]` field — construct, read `.length` + an element => 30",
    src: [
      "type Box = { tag: i32, items: i32[] }",
      "function f(): i32 {",
      "  let b: Box = { tag: 7, items: [10, 20, 30] }",
      "  return b.tag + b.items.length + b.items[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 7 (tag) + 3 (length) + 20 (items[1]) = 30.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 30) throw new Error(`f() returned ${got}, expected 30`);
    },
  },
  {
    name: "G5: WRITE a struct `i32[]` field then read it back (`b.items = xs` => 200)",
    src: [
      "type Box = { tag: i32, items: i32[] }",
      "function f(): i32 {",
      "  let b: Box = { tag: 0, items: [1] }",
      "  let xs: i32[] = [100, 200, 300]",
      "  b.items = xs",
      "  return b.items[1]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 200) throw new Error(`f() returned ${got}, expected 200`);
    },
  },
  {
    name: "G5: build a struct `i32[]` field in a loop via a local, read back => 45",
    src: [
      "type Box = { items: i32[] }",
      "function f(): i32 {",
      "  let xs: i32[] = []",
      "  let i = 0",
      "  while i < 10 {",
      "    xs.push(i)",
      "    i = i + 1",
      "  }",
      "  let b: Box = { items: xs }",
      "  let sum = 0",
      "  let j = 0",
      "  while j < b.items.length {",
      "    sum = sum + b.items[j]",
      "    j = j + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 0+1+...+9 = 45.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 45) throw new Error(`f() returned ${got}, expected 45`);
    },
  },
  {
    // A REF-element array field `Tok[]` over a declared struct stores a REF to the
    // ref-list wrapper (`(ref $rlTypeIdx)`). Construction assigns a ref list, a field
    // read yields the ref-list ref (so `.length` and ref-indexing — which recovers the
    // non-null struct element — work).
    name: "G5: struct with a `Tok[]` (ref-element) field — read length + element field => 22",
    src: [
      "type Tok = { kind: i32, val: i32 }",
      "type Arena = { toks: Tok[] }",
      "function f(): i32 {",
      "  let a: Arena = { toks: [ { kind: 1, val: 10 }, { kind: 2, val: 20 } ] }",
      "  return a.toks.length + a.toks[1].val",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // length 2 + toks[1].val (20) = 22.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 22) throw new Error(`f() returned ${got}, expected 22`);
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
  globalStmts = []
  globalNames = []
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

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
    // REGRESSION: a `let` buried in the THIRD arm of a long `if / else if / else if
    // / else` chain INSIDE a while body. `collectLocals` used to hand-unroll only the
    // FIRST nested `else if`, so the slot for `c` (and `d`) was never allocated and
    // `emitStmt` failed with "local declaration has no allocated slot". The `else if`
    // walk is now recursive (`collectLocalsIf`), so every arm at any depth is walked.
    // `count(4)` runs i=0..3, taking each arm once: 10+20+30+40 = 100.
    name: "nested `let` in a deep else-if chain inside a while body (slot at every arm)",
    src: [
      "function count(n: i32): i32 {",
      "  let total = 0",
      "  let i = 0",
      "  while i < n {",
      "    if i == 0 {",
      "      let a = 10",
      "      total = total + a",
      "    } else if i == 1 {",
      "      let b = 20",
      "      total = total + b",
      "    } else if i == 2 {",
      "      let c = 30",
      "      total = total + c",
      "    } else {",
      "      let d = 40",
      "      total = total + d",
      "    }",
      "    i = i + 1",
      "  }",
      "  return total",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "count", 4);
      if (got !== 100) throw new Error(`count(4) returned ${got}, expected 100`);
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
    // A nested array element type that is genuinely unsupported (`i32[][]`) still fails
    // loudly — the `string[]` element type is now supported (see the G5/G3 string-list
    // tests below), but an array-of-arrays element has no list type.
    name: "a nested array element type (`i32[][]`) fails loudly",
    src: [
      "function main(): i32 {",
      "  let a: i32[][] = []",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: (logs) => {
      const errLine = logs.find((l) => l.startsWith("err: "));
      if (!errLine) {
        throw new Error(
          `expected an \`err:\` line for the nested array; got ${
            JSON.stringify(logs)
          }`,
        );
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
    // gap #2: a function takes a union-VARIANT struct as a param (`o: TyObj`), reads its
    // ARRAY fields (`o.names` a `string[]`, `o.tys` an `i32[]`) directly off the unboxed
    // variant struct — the shape of `typecheck.vl`'s `objFieldType(o: TyObj, …)`. The
    // caller narrows a union value to the variant and passes it; the call boundary
    // unboxes the box to the concrete variant struct ref (no narrowing inside the callee).
    name: "a union-variant struct param reads its array fields (objFieldType shape) => 2",
    src: [
      "type TyObj = { names: string[], tys: i32[] }",
      "type TyNum = { nv: i32 }",
      "type Ty = TyObj | TyNum",
      "function objFieldType(o: TyObj, name: string): i32 {",
      "  let names = o.names",
      "  let ftys = o.tys",
      "  let i = 0",
      "  while i < names.length {",
      "    if names[i] == name {",
      "      return ftys[i]",
      "    }",
      "    i = i + 1",
      "  }",
      "  return 0 - 1",
      "}",
      "function lookup(t: Ty, name: string): i32 {",
      "  if t is TyObj {",
      "    return objFieldType(t, name)",
      "  }",
      "  return 0 - 99",
      "}",
      "function mkObj(): Ty {",
      "  return { names: [\"a\", \"bb\"], tys: [7, 2] }",
      "}",
      "function main(): i32 {",
      "  return lookup(mkObj(), \"bb\")",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // `mkObj()` builds a `TyObj` boxed in `Ty`; `lookup` narrows to `TyObj` and passes
      // it to `objFieldType`, which finds `"bb"` at index 1 and returns `tys[1] === 2`.
      const got = await runMain(bytesFromLog(logs));
      if (got !== 2) throw new Error(`main() returned ${got}, expected 2`);
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
  {
    // A UNION-VARIANT field of array type (`Call.args: i32[]`). The variant struct
    // stores the i32-list wrapper ref; after `is`-narrowing, the field read recovers
    // the list ref (downcast through the box) so `.length` / indexing apply — this is
    // the shape `ast.vl`'s `Node` variants (`Call.callArgs: Node[]`, …) need.
    name: "G5: union-variant with an `i32[]` field — narrow then read length + element => 4",
    src: [
      "type Call = { args: i32[] }",
      "type Lit = { val: i32 }",
      "type Node = Call | Lit",
      "function f(n: Node): i32 {",
      "  if n is Call { return n.args.length + n.args[0] }",
      "  return 0",
      "}",
      "function mk(): Node {",
      "  return { args: [2, 9] }",
      "}",
      "function main(): i32 {",
      "  return f(mk())",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // args = [2, 9]; length (2) + args[0] (2) = 4.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 4) throw new Error(`main() returned ${got}, expected 4`);
    },
  },
  // ── G3: `.push` onto a struct-FIELD array ──────────────────────────────────
  // `b.items.push(x)` resolves the receiver to the struct field's i32-list wrapper ref
  // (loaded once into a scratch local), then runs the existing list grow/append against
  // it — the wrapper is mutated in place by reference, so the field sees the appended
  // element. This is the `P.nodes.push(n)` arena-mutation shape `parser.vl` needs.
  {
    name: "G3: push onto a struct `i32[]` field grows it; read length + element => 33",
    src: [
      "type Box = { items: i32[] }",
      "function f(): i32 {",
      "  let b: Box = { items: [] }",
      "  b.items.push(10)",
      "  b.items.push(20)",
      "  b.items.push(30)",
      "  return b.items.length + b.items[2]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // length 3 + items[2] (30) = 33.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 33) throw new Error(`f() returned ${got}, expected 33`);
    },
  },
  {
    // The core arena shape: a GLOBAL struct with a `Node[]`-style ref-list field, mutated
    // through `.push`. Here `Item[]` (struct-element ref list) stands in for `Node[]`.
    name: "G3: push onto a GLOBAL struct's EMPTY ref-list field, read back => 11",
    src: [
      "type Item = { v: i32 }",
      "type Arena = { items: Item[] }",
      "let A: Arena = { items: [] }",
      "function f(): i32 {",
      "  A.items.push({ v: 5 })",
      "  A.items.push({ v: 9 })",
      "  return A.items.length + A.items[1].v",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // items starts empty, push {v:5},{v:9} → length 2 + items[1].v (9) = 11.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 11) throw new Error(`f() returned ${got}, expected 11`);
    },
  },
  // ── G5/G3: `string[]` struct / union-variant fields ─────────────────────────
  // A `string[]` field is a string-ref list — the SAME `{backing,len,cap}` wrapper the
  // map keys list uses, over a `(ref null $aTypeIdx)` string backing. Construction
  // assigns the list, a field read yields the wrapper ref (so `.length`, indexing — which
  // recovers a non-null string for `==` — apply), a field write stores a list ref, and
  // `.push` of a string appends. This is the `UnionDecl.udVariants: string[]` shape — the
  // last array-field gap before the front-end arena is fully expressible.
  {
    name: "G5: struct with a `string[]` field — construct, read `.length` + an element via `==` => 3",
    src: [
      "type Box = { tag: i32, names: string[] }",
      "function f(): i32 {",
      "  let b: Box = { tag: 1, names: [\"hi\", \"yo\", \"zz\"] }",
      "  let n = 0",
      "  if b.names[1] == \"yo\" { n = 2 }",
      "  return b.tag + b.names.length - n",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 1 (tag) + 3 (length) - 2 (matched "yo") = 2... recompute: 1 + 3 - 2 = 2.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 2) throw new Error(`f() returned ${got}, expected 2`);
    },
  },
  {
    name: "G5: construct a struct `string[]` field EMPTY (`{ names: [] }`), read `.length` => 0",
    src: [
      "type Box = { names: string[] }",
      "function f(): i32 {",
      "  let b: Box = { names: [] }",
      "  return b.names.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 0) throw new Error(`f() returned ${got}, expected 0`);
    },
  },
  {
    name: "G5: WRITE a struct `string[]` field then read it back (`b.names = xs` => 1)",
    src: [
      "type Box = { names: string[] }",
      "function f(): i32 {",
      "  let b: Box = { names: [\"a\"] }",
      "  let xs: string[] = [\"p\", \"q\", \"r\"]",
      "  b.names = xs",
      "  let n = 0",
      "  if b.names[2] == \"r\" { n = 1 }",
      "  return n",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 1) throw new Error(`f() returned ${got}, expected 1`);
    },
  },
  {
    name: "G3: push a string onto a struct `string[]` field, read it back => 2",
    src: [
      "type Box = { names: string[] }",
      "function f(): i32 {",
      "  let b: Box = { names: [] }",
      "  b.names.push(\"x\")",
      "  b.names.push(\"y\")",
      "  let n = b.names.length",
      "  if b.names[1] == \"y\" { n = n + 0 } else { n = 0 }",
      "  return n",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // length 2, names[1] == "y" → 2.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 2) throw new Error(`f() returned ${got}, expected 2`);
    },
  },
  {
    // The `UnionDecl.udVariants: string[]` shape: a union variant with a `string[]` field.
    // After `is`-narrowing the variant, the field read recovers the string-list ref
    // (downcast through the box) so `.length` / indexing / `==` apply.
    name: "G5: union-variant with a `string[]` field — narrow then read length + element => 4",
    src: [
      "type UnionDecl = { udName: string, udVariants: string[] }",
      "type Other = { v: i32 }",
      "type Decl = UnionDecl | Other",
      "function f(d: Decl): i32 {",
      "  if d is UnionDecl {",
      "    let n = d.udVariants.length",
      "    if d.udVariants[0] == \"A\" { n = n + 2 }",
      "    return n",
      "  }",
      "  return 0",
      "}",
      "function mk(): Decl {",
      "  return { udName: \"E\", udVariants: [\"A\", \"B\"] }",
      "}",
      "function main(): i32 {",
      "  return f(mk())",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // length 2 + 2 (udVariants[0] == "A") = 4.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 4) throw new Error(`main() returned ${got}, expected 4`);
    },
  },
  {
    // `typecheck.vl`'s `tyToStr`/`assignable` shape: BIND a narrowed union-variant's
    // ARRAY field to a LOCAL first (`let ftys = t.objFieldTypes`), THEN read
    // `.length`/index off that local. `collectLocals` runs as a pre-pass OUTSIDE the
    // narrowing context, so it could not see the variant field's array type and
    // mis-classified the local as a scalar i32 — `ftys.length` then fell through to
    // the struct-field path and failed ("field access but no struct type declared").
    // `collectLocalsIf` now narrows across the then-branch (mirroring `emitStmt`), so
    // both the `i32[]` and `string[]` variant-field binds type as array locals.
    name:
      "G5: bind a narrowed union-variant's `i32[]`/`string[]` field to a local, read it => 12",
    src: [
      "type TyObj = { objFieldNames: string[], objFieldTypes: i32[] }",
      "type TyPrim = { primName: string }",
      "type Ty = TyObj | TyPrim",
      "function f(t: Ty): i32 {",
      "  if t is TyObj {",
      "    let names = t.objFieldNames",
      "    let ftys = t.objFieldTypes",
      "    return names.length + ftys.length + ftys[0]",
      "  }",
      "  return 0",
      "}",
      "function mk(): Ty {",
      '  return { objFieldNames: ["a"], objFieldTypes: [9, 2] }',
      "}",
      "function main(): i32 {",
      "  return f(mk())",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // names.length 1 + ftys.length 2 + ftys[0] 9 = 12.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 12) throw new Error(`main() returned ${got}, expected 12`);
    },
  },
  {
    // A `string[]` field ALONGSIDE a map in the same program: both want the string-ref
    // list types (keys backing + wrapper) — they SHARE `mkArrIdx`/`mkListIdx` (the map
    // struct adds one more type), so the type-section offsets must stay consistent.
    name: "G5: a `string[]` field and a map coexist (shared string-list types) => 7",
    src: [
      "type Box = { names: string[] }",
      "function f(): i32 {",
      "  let b: Box = { names: [\"a\", \"b\"] }",
      "  b.names.push(\"c\")",
      "  let m: {[string]: i32} = Map()",
      "  m[\"x\"] = 4",
      "  return b.names.length + m[\"x\"]",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // names length 3 + m["x"] (4) = 7.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 7) throw new Error(`f() returned ${got}, expected 7`);
    },
  },
  {
    // A `.push` buried under 2+ `else if` arms (the `parseProgram` / `parseStmt`
    // recursive-descent dispatch shape: `if k=="EOF" {} else if k=="NL" { adv() }
    // else if k=="IMPORT" { skip() } else { stmts.push(parseStmt()) }`). The
    // scratch-reservation walkers (`blockHasPushKind`/`blockHasStrOp`/the ref-push
    // slot collector) used a HAND-UNROLLED one-level else-if descent, so a push (or
    // string op) under the SECOND-or-later `else if` was missed — the function then
    // reserved no push scratch and the append wrote into local 0, failing to validate
    // (`local.set[0] expected (ref N), found call of type i32`). Now they recurse the
    // whole else-if chain. Drives real lexer->parser->emitProgram->engine.
    name: "G3: `.push` under 2+ `else if` arms reserves scratch correctly => 4",
    src: [
      "function f(): i32 {",
      "  let stmts: i32[] = []",
      "  let i = 0",
      "  while i < 8 {",
      "    let k = i % 4",
      "    if k == 0 {",
      "      i = i + 1",
      "    } else if k == 1 {",
      "      i = i + 1",
      "    } else if k == 2 {",
      "      i = i + 1",
      "    } else {",
      "      stmts.push(i)",
      "      i = i + 1",
      "    }",
      "  }",
      "  return stmts.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // i in 0..7; k==3 at i=3 and i=7 → 2 pushes → length 2... recompute: k=i%4==3
      // when i==3 and i==7 → 2 elements. Expect 2.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 2) throw new Error(`f() returned ${got}, expected 2`);
    },
  },
  {
    // CONSTRUCTION-side counterpart: a struct `string[]` field built from a `string[]`
    // SOURCE local (not a literal / not empty) — the `mkUnionDecl { udVariants: variants }`
    // shape in `ast.vl`. The `i32[]` analogue (`{ items: xs }`) already works; this proves
    // the string-list wrapper ref is supplied for the field value (not a bare i32).
    name: "G5: construct a struct `string[]` field from a `string[]` SOURCE local => 3",
    src: [
      "type UnionDecl = { udName: string, udVariants: string[] }",
      "function f(): i32 {",
      "  let variants: string[] = [\"A\", \"B\", \"C\"]",
      "  let n: UnionDecl = { udName: \"E\", udVariants: variants }",
      "  let r = n.udVariants.length",
      "  if n.udVariants[2] == \"C\" { r = r + 0 } else { r = 0 }",
      "  return r",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // udVariants = ["A","B","C"]; length 3, udVariants[2]=="C" → 3.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 3) throw new Error(`f() returned ${got}, expected 3`);
    },
  },
  {
    // The EXACT `ast.vl` `mkUnionDecl` shape: a UNION-VARIANT `string[]` field built from
    // a `string[]` PARAMETER (not a local, not a literal). This is the real instantiation
    // blocker — the variant-struct construction supplies an i32 where the string-list
    // wrapper ref is expected.
    name: "G5: construct a UNION-VARIANT `string[]` field from a `string[]` PARAM => 3",
    src: [
      "type UnionDecl = { udName: string, udVariants: string[] }",
      "type Other = { v: i32 }",
      "type Node = UnionDecl | Other",
      "function mkUnionDecl(name: string, variants: string[]): Node {",
      "  let n: Node = { udName: name, udVariants: variants }",
      "  return n",
      "}",
      "function f(d: Node): i32 {",
      "  if d is UnionDecl {",
      "    let r = d.udVariants.length",
      "    if d.udVariants[2] == \"C\" { r = r + 0 } else { r = 0 }",
      "    return r",
      "  }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  let variants: string[] = [\"A\", \"B\", \"C\"]",
      "  return f(mkUnionDecl(\"E\", variants))",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  // ── struct-typed params in a mutually-recursive / forward-referencing group (#6) ──
  // Passing a struct VALUE into a forward-referenced / mutually-recursive callee whose
  // param is a struct type. The keystone was a literal argument constructing as a
  // FIELD-NAME guess (`structIndexOfObj`, always the first matching struct) instead of
  // the callee parameter's DECLARED struct type — so when two structs share a field set
  // (the natural `parseExpr(p)`/`parseStmt(p)` recursive-descent shape, where every
  // parser-state struct looks alike) the `struct.new` produced `(ref 0)` where the call
  // wanted `(ref 1)` and the module failed to validate. `emitCall` now hints `emitObj`
  // with the callee param's struct index. Each proves real `WebAssembly.instantiate`.
  {
    name:
      "#6: mutually-recursive group passing a struct param (single type) => 5",
    src: [
      "type S = { n: i32 }",
      "function a(s: S): i32 {",
      "  if s.n <= 0 { return 0 }",
      "  return b({ n: s.n - 1 })",
      "}",
      "function b(s: S): i32 {",
      "  return a({ n: s.n }) + 1",
      "}",
      "function main(): i32 {",
      "  return a({ n: 5 })",
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
      "#6: a struct param forwarded ONWARD (`b(s)`) into the recursive callee => 5",
    src: [
      "type S = { n: i32 }",
      "function a(s: S): i32 {",
      "  if s.n <= 0 { return 0 }",
      "  return b(s)",
      "}",
      "function b(s: S): i32 {",
      "  return a({ n: s.n - 1 }) + 1",
      "}",
      "function main(): i32 {",
      "  return a({ n: 5 })",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    // The keystone: two structs with the SAME field name (`n`). The literal passed to
    // `b` must construct as `T` (the callee param's type, index 1), NOT `S` (index 0,
    // the first field-name match) — pre-fix this emitted `struct.new $0` against a
    // `(ref 1)` call and failed validation.
    name:
      "#6: ambiguous field-name structs (S/T both `{ n }`) resolve to the CALLEE's type => 5",
    src: [
      "type S = { n: i32 }",
      "type T = { n: i32 }",
      "function a(s: S): i32 {",
      "  if s.n <= 0 { return 0 }",
      "  return b({ n: s.n - 1 })",
      "}",
      "function b(t: T): i32 {",
      "  return a({ n: t.n }) + 1",
      "}",
      "function main(): i32 {",
      "  return a({ n: 5 })",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    // Three distinct ambiguous structs across a 3-way mutually-recursive cycle.
    // fa(3)→fb(2)→fc(2)→fa(2)+10→fb(1)→fc(1)→fa(1)+10→fb(0)→fc(0)→fa(0)+10
    // fa(0)=0; each fc adds 10, each fb adds 1: returns 33.
    name:
      "#6: three ambiguous structs in a 3-way mutual-recursion cycle => 33",
    src: [
      "type A = { v: i32 }",
      "type B = { v: i32 }",
      "type C = { v: i32 }",
      "function fa(x: A): i32 {",
      "  if x.v <= 0 { return 0 }",
      "  return fb({ v: x.v - 1 })",
      "}",
      "function fb(x: B): i32 {",
      "  return fc({ v: x.v }) + 1",
      "}",
      "function fc(x: C): i32 {",
      "  return fa({ v: x.v }) + 10",
      "}",
      "function main(): i32 {",
      "  return fa({ v: 3 })",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 33) throw new Error(`main() returned ${got}, expected 33`);
    },
  },
  {
    // Two DISTINCT struct types (different field sets) passed across the group, each
    // callee reading its own fields — a wrong type-index would mis-offset the field
    // read. f({a:2,b:7})→g({x:1,y:7,z:100})→f({a:1,b:7})+100→g({x:0,..})→f(0)+100→0
    // f(0)=0; g returns 0+100=100; f returns 100; g returns 100+100=200.
    name: "#6: two distinct struct types across the group, distinct field reads => 200",
    src: [
      "type S = { a: i32, b: i32 }",
      "type T = { x: i32, y: i32, z: i32 }",
      "function f(s: S): i32 {",
      "  if s.a <= 0 { return 0 }",
      "  return g({ x: s.a - 1, y: s.b, z: 100 })",
      "}",
      "function g(t: T): i32 {",
      "  return f({ a: t.x, b: t.y }) + t.z",
      "}",
      "function main(): i32 {",
      "  return f({ a: 2, b: 7 })",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 200) throw new Error(`main() returned ${got}, expected 200`);
    },
  },
  {
    // The natural `parseExpr(p)`/`parseStmt(p)` recursive-descent shape: a struct param
    // whose FIELD is read, then a NEW struct constructed and passed onward to the
    // mutually-recursive callee — exactly why `parser.vl` had to thread state via the
    // global `P`. parseExpr(0,3)→parseStmt(1,2)→parseExpr(11,1)→parseStmt(12,0)→
    // parseExpr(22,0): depth<=0 → return pos = 22.
    name:
      "#6: parseX(p)-shape — read a struct-param field, build a NEW struct, pass on => 22",
    src: [
      "type Parser = { pos: i32, depth: i32 }",
      "function parseExpr(p: Parser): i32 {",
      "  if p.depth <= 0 { return p.pos }",
      "  return parseStmt({ pos: p.pos + 1, depth: p.depth - 1 })",
      "}",
      "function parseStmt(p: Parser): i32 {",
      "  return parseExpr({ pos: p.pos + 10, depth: p.depth - 1 })",
      "}",
      "function main(): i32 {",
      "  return parseExpr({ pos: 0, depth: 3 })",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runMain(bytesFromLog(logs));
      if (got !== 22) throw new Error(`main() returned ${got}, expected 22`);
    },
  },
  {
    // WRITE an EMPTY `[]` to a struct REF-LIST field via FIELD ASSIGNMENT
    // (`P.toks = []`), with a SECOND struct type declared so the element type is
    // not heap-type 0. The empty literal must adopt the field's declared ref-list
    // wrapper — the field-assignment path threads `pendingListKind` from the field
    // type (the `parser.vl` cursor reset `P.toks = []` shape). Without it the empty
    // `[]` defaults to the i32-list wrapper and the `struct.set` rejects it.
    name:
      "G5: field-assign an EMPTY `[]` to a struct ref-list field, then push + read => 2",
    src: [
      "type Tok = { kind: string, text: string, pos: i32 }",
      "type Parser = { toks: Tok[], pos: i32 }",
      "let P: Parser = { toks: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks = []",
      "  P.toks.push({ kind: \"A\", text: \"a\", pos: 0 })",
      "  P.toks.push({ kind: \"B\", text: \"b\", pos: 1 })",
      "  return P.toks.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // toks reset to empty, then 2 pushed → length 2.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 2) throw new Error(`f() returned ${got}, expected 2`);
    },
  },
  {
    // THE KEYSTONE: a struct holding TWO DISTINCT struct ref-list fields at once
    // (`toks: Tok[]`, `diags: Diag[]`) — the `parser.vl` `Parser` shape. Each field
    // must intern its OWN backing+wrapper heap type; a single program-global ref-list
    // type made `P.diags.push(...)` fail validation (`expected (ref 0), found (ref 1)`).
    // Push onto each, read each length back, sum.
    name:
      "G7-multi: TWO distinct struct ref-list fields (Tok[] + Diag[]) push + read each => 3",
    src: [
      "type Tok = { kind: string, pos: i32 }",
      "type Diag = { msg: string, at: i32 }",
      "type Parser = { toks: Tok[], diags: Diag[], pos: i32 }",
      "let P: Parser = { toks: [], diags: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks.push({ kind: \"A\", pos: 0 })",
      "  P.toks.push({ kind: \"B\", pos: 1 })",
      "  P.diags.push({ msg: \"x\", at: 0 })",
      "  return P.toks.length + P.diags.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 2 toks + 1 diag → 3.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 3) throw new Error(`f() returned ${got}, expected 3`);
    },
  },
  {
    // Read an ELEMENT back out of each distinct ref-list field and use its i32 field —
    // proves the per-slot `array.get` + `ref.as_non_null` recover the RIGHT element
    // struct type for each of the two distinct lists.
    name:
      "G7-multi: read an element field from each of two distinct ref-list fields => 30",
    src: [
      "type Tok = { kind: string, pos: i32 }",
      "type Diag = { msg: string, at: i32 }",
      "type Parser = { toks: Tok[], diags: Diag[], pos: i32 }",
      "let P: Parser = { toks: [], diags: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks.push({ kind: \"A\", pos: 10 })",
      "  P.diags.push({ msg: \"x\", at: 20 })",
      "  return P.toks[0].pos + P.diags[0].at",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // toks[0].pos (10) + diags[0].at (20) → 30.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 30) throw new Error(`f() returned ${got}, expected 30`);
    },
  },
  {
    // THREE distinct ref-list element types at once: two STRUCT lists (Tok[], Diag[])
    // AND a UNION list (Node[]) in the same struct — the full `parser.vl` `Parser`
    // shape. A union list's element is the box ref (a distinct slot from either struct
    // backing). Push onto all three, read each length.
    name:
      "G7-multi: two struct ref-lists + a union ref-list in one struct => 6",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { name: string }",
      "type Node = Lit | Var",
      "type Tok = { kind: string, pos: i32 }",
      "type Diag = { msg: string, at: i32 }",
      "type Parser = { toks: Tok[], nodes: Node[], diags: Diag[], pos: i32 }",
      "let P: Parser = { toks: [], nodes: [], diags: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks.push({ kind: \"A\", pos: 0 })",
      "  P.toks.push({ kind: \"B\", pos: 1 })",
      "  P.nodes.push({ val: 9 })",
      "  P.nodes.push({ name: \"y\" })",
      "  P.nodes.push({ val: 7 })",
      "  P.diags.push({ msg: \"x\", at: 0 })",
      "  return P.toks.length + P.nodes.length + P.diags.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // 2 toks + 3 nodes + 1 diag → 6.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 6) throw new Error(`f() returned ${got}, expected 6`);
    },
  },
  {
    // Narrow a union element read back out of the union ref-list (alongside the two
    // struct ref-lists) and read its variant field — proves the union list's element is
    // the box and `is`-narrowing works on an element pulled from a multi-ref-list struct.
    name:
      "G7-multi: narrow a union element pulled from a multi-ref-list struct => 9",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { name: string }",
      "type Node = Lit | Var",
      "type Tok = { kind: string, pos: i32 }",
      "type Parser = { toks: Tok[], nodes: Node[], pos: i32 }",
      "let P: Parser = { toks: [], nodes: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks.push({ kind: \"A\", pos: 5 })",
      "  P.nodes.push({ val: 9 })",
      "  let n = P.nodes[0]",
      "  if n is Lit { return n.val }",
      "  return 0",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // nodes[0] is a Lit with val 9 → 9.
      const got = await runExport(bytesFromLog(logs), "f");
      if (got !== 9) throw new Error(`f() returned ${got}, expected 9`);
    },
  },
  {
    // PROBE: a realistic multi-function parser excerpt over the real `Parser` shape —
    // `peekTok`/`advance` returning a struct pulled from a ref list, mutating cursor,
    // plus a union-node push. Mirrors the actual `parser.vl` recursive-descent shape.
    name:
      "G7-multi PROBE: parser-shaped peek/advance + union push over the Parser struct",
    src: [
      "type Tok = { kind: string, text: string, pos: i32 }",
      "type Lit = { val: i32 }",
      "type Var = { vname: string }",
      "type Node = Lit | Var",
      "type Diag = { msg: string, at: i32 }",
      "type Parser = { toks: Tok[], nodes: Node[], diags: Diag[], pos: i32 }",
      "let P: Parser = { toks: [], nodes: [], diags: [], pos: 0 }",
      "function peekTok(): Tok {",
      "  if P.pos >= P.toks.length {",
      "    return P.toks[P.toks.length - 1]",
      "  }",
      "  return P.toks[P.pos]",
      "}",
      "function advance(): Tok {",
      "  let t = peekTok()",
      "  if P.pos < P.toks.length {",
      "    P.pos = P.pos + 1",
      "  }",
      "  return t",
      "}",
      "function main(): i32 {",
      "  P.toks.push({ kind: \"NUM\", text: \"9\", pos: 0 })",
      "  P.toks.push({ kind: \"ID\", text: \"x\", pos: 1 })",
      "  P.nodes.push({ val: 9 })",
      "  P.diags.push({ msg: \"e\", at: 0 })",
      "  let a = advance()",
      "  let b = advance()",
      "  return a.pos + b.pos + P.nodes.length + P.diags.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // a.pos(0) + b.pos(1) + nodes.length(1) + diags.length(1) = 3.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 3) throw new Error(`main() returned ${got}, expected 3`);
    },
  },
  {
    // KEYSTONE (multi-union): TWO distinct union types declared in one program —
    // `Node` (Lit|Var) and `Ty` (TyInt|TyStr). Construct a value of EACH union, box it,
    // and narrow it back with `is`, reading a variant field of each. Mirrors `ast.vl`'s
    // `Node` coexisting with `typecheck.vl`'s `Ty`. Proves the per-union table accepts a
    // 2nd union and the shared box + globally-unique tags discriminate both.
    name:
      "multi-union: TWO unions construct + narrow + variant-field-read each => 7",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { vname: string }",
      "type Node = Lit | Var",
      "type TyInt = { width: i32 }",
      "type TyStr = { len: i32 }",
      "type Ty = TyInt | TyStr",
      "function nodeVal(): i32 {",
      "  let n: Node = { val: 3 }",
      "  if n is Lit { return n.val }",
      "  return 0",
      "}",
      "function tyVal(): i32 {",
      "  let t: Ty = { width: 4 }",
      "  if t is TyInt { return t.width }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  return nodeVal() + tyVal()",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // nodeVal()=3 (Lit.val) + tyVal()=4 (TyInt.width) → 7.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    // The OTHER variant of each union — narrow to the 2nd variant of `Node` (Var) and the
    // 2nd of `Ty` (TyStr), reading their distinct fields. Confirms each union's full
    // variant set is reachable, not just the first variant.
    name:
      "multi-union: narrow to the SECOND variant of each of two unions => 11",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { tag: i32 }",
      "type Node = Lit | Var",
      "type TyInt = { width: i32 }",
      "type TyStr = { len: i32 }",
      "type Ty = TyInt | TyStr",
      "function nodeTag(): i32 {",
      "  let n: Node = { tag: 5 }",
      "  if n is Var { return n.tag }",
      "  return 0",
      "}",
      "function tyLen(): i32 {",
      "  let t: Ty = { len: 6 }",
      "  if t is TyStr { return t.len }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  return nodeTag() + tyLen()",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // nodeTag()=5 (Var.tag) + tyLen()=6 (TyStr.len) → 11.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 11) throw new Error(`main() returned ${got}, expected 11`);
    },
  },
  {
    // A union-typed PARAM + RETURN of each of two unions threaded through a call: a
    // function takes a `Node`, narrows it, and another takes a `Ty`. Proves the valtype
    // layer (`pushVT` kind 4) types params/returns of EITHER union (shared box ref).
    name:
      "multi-union: union-typed param of each of two unions => 30",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { vname: string }",
      "type Node = Lit | Var",
      "type TyInt = { width: i32 }",
      "type TyStr = { len: i32 }",
      "type Ty = TyInt | TyStr",
      "function readNode(n: Node): i32 {",
      "  if n is Lit { return n.val }",
      "  return 0",
      "}",
      "function readTy(t: Ty): i32 {",
      "  if t is TyInt { return t.width }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  let n: Node = { val: 10 }",
      "  let t: Ty = { width: 20 }",
      "  return readNode(n) + readTy(t)",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // readNode(Lit{val:10})=10 + readTy(TyInt{width:20})=20 → 30.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 30) throw new Error(`main() returned ${got}, expected 30`);
    },
  },
  {
    // KEYSTONE (ref-lists of two unions): a struct holds a `Node[]` AND a `Ty[]` — two
    // distinct union ref-lists coexisting. Push variants onto each, pull one back out of
    // each list, narrow it, and read a variant field. Mirrors the multi-ref-list table
    // interning each union list as its OWN slot.
    name:
      "multi-union: a Node[] AND a Ty[] coexist, narrow an element of each => 12",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { vname: string }",
      "type Node = Lit | Var",
      "type TyInt = { width: i32 }",
      "type TyStr = { len: i32 }",
      "type Ty = TyInt | TyStr",
      "type Bag = { nodes: Node[], tys: Ty[] }",
      "let B: Bag = { nodes: [], tys: [] }",
      "function main(): i32 {",
      "  B.nodes.push({ val: 8 })",
      "  B.tys.push({ width: 4 })",
      "  let n = B.nodes[0]",
      "  let t = B.tys[0]",
      "  let acc = 0",
      "  if n is Lit { acc = acc + n.val }",
      "  if t is TyInt { acc = acc + t.width }",
      "  return acc",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // nodes[0]=Lit{val:8} → 8, tys[0]=TyInt{width:4} → 4, total 12.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 12) throw new Error(`main() returned ${got}, expected 12`);
    },
  },
  {
    // The scope-chain keystone: an ARRAY whose element is a Map (`{[string]:i32}[]`).
    // Push two fresh maps, length reflects the pushes.
    name: "scope-chain: {[string]:i32}[] empty, push two Map()s, .length => 2",
    src: [
      "function main(): i32 {",
      "  let scopes: {[string]: i32}[] = []",
      "  scopes.push(Map())",
      "  scopes.push(Map())",
      "  return scopes.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 2) throw new Error(`main() returned ${got}, expected 2`);
    },
  },
  {
    // Index an element (a Map ref), set a key in it, read it back with `?? d`.
    name: "scope-chain: index a pushed map, set + get a key => 7",
    src: [
      "function main(): i32 {",
      "  let scopes: {[string]: i32}[] = []",
      "  scopes.push(Map())",
      '  scopes[0]["x"] = 7',
      '  return scopes[0]["x"] ?? -1',
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 7) throw new Error(`main() returned ${got}, expected 7`);
    },
  },
  {
    // `.pop()` on a plain i32 list: returns the last element + shrinks the length.
    name: "pop: i32[] pop returns last + decrements length (3 then len 2 => 5)",
    src: [
      "function main(): i32 {",
      "  let xs: i32[] = [1, 2, 3]",
      "  let last = xs.pop()",
      "  return last + xs.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // last = 3, remaining length = 2, 3 + 2 = 5.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 5) throw new Error(`main() returned ${got}, expected 5`);
    },
  },
  {
    // `.pop()` on the map-array scope chain: pop the last scope, the popped Map is a
    // usable Map ref (read a key out of it), and the stack shrinks.
    name: "scope-chain: pop the last map, read a key from the popped map => 9",
    src: [
      "function main(): i32 {",
      "  let scopes: {[string]: i32}[] = []",
      "  scopes.push(Map())",
      "  scopes.push(Map())",
      '  scopes[1]["k"] = 9',
      "  let top = scopes.pop()",
      '  let v = top["k"] ?? -1',
      "  return v + scopes.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // popped map has k=9, remaining length = 1 → 9 + 1 = 10.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 10) throw new Error(`main() returned ${got}, expected 10`);
    },
  },
  {
    // End-to-end scope chain: push scopes, set keys in DIFFERENT scopes, has/get-with-
    // default lookups across the stack, then pop. Mirrors typecheck.vl's scope handling.
    name: "scope-chain: push/set-across-scopes/has/get-default/pop end-to-end => 1",
    src: [
      "function main(): i32 {",
      "  let scopes: {[string]: i32}[] = []",
      "  scopes.push(Map())",
      '  scopes[0]["g"] = 1',
      "  scopes.push(Map())",
      '  scopes[1]["x"] = 2',
      "  let acc = 0",
      '  if scopes[1].has("x") { acc = acc + (scopes[1]["x"] ?? -1) }',
      '  if scopes[0].has("g") { acc = acc + (scopes[0]["g"] ?? -1) }',
      '  acc = acc + (scopes[1]["missing"] ?? 100)',
      "  scopes.pop()",
      "  acc = acc + scopes.length",
      "  return acc",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // x=2, g=1, missing default=100, after pop length=1 → 2+1+100+1 = 104.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 104) throw new Error(`main() returned ${got}, expected 104`);
    },
  },
  {
    // `.pop()` on a STRUCT-FIELD ref-list receiver (`T.scopes.pop()`) — typecheck.vl's
    // `popScope` shape. The field's wrapper ref is evaluated once into the push frame's
    // `recvRef` scratch (reserved for a pop-only function), then the in-place len-decrement
    // + element-read run against it. Mirrors a map ref-list field (`{[string]:i32}[]`).
    name: "scope-chain: `.pop()` on a STRUCT-FIELD ref-list (popScope shape) => 1",
    src: [
      "type Checker = { scopes: {[string]: i32}[] }",
      "let C: Checker = { scopes: [] }",
      "function pushScope(): i32 {",
      "  C.scopes.push(Map())",
      "  0",
      "}",
      "function popScope(): i32 {",
      "  let dropped = C.scopes.pop()",
      "  0",
      "}",
      "function main(): i32 {",
      "  pushScope()",
      "  pushScope()",
      "  popScope()",
      "  return C.scopes.length",
      "}",
      "",
    ].join("\n"),
    check: async (logs) => {
      // Two pushes then one pop leaves one scope on the chain.
      const got = await runExport(bytesFromLog(logs), "main");
      if (got !== 1) throw new Error(`main() returned ${got}, expected 1`);
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

// Run-time perf baseline for compiled VL (companion to `scripts/perf.ts`, which
// measures COMPILE time). This times the EXECUTION of the emitted wasm, isolated
// from compile time, so a codegen change or a `.vl`-algorithm change can be judged
// on what it does to *running* VL — not just compiling it.
//
// Why a script, not `vl run` + `time`: that folds Deno startup + compile +
// instantiate into one number, which dominates for short programs. And why not a
// built-in `vl bench`: detailed per-function hotspot info belongs to the wasm
// runtime (V8 `--prof`, wasmtime profiling) — this harness only does the
// orchestration those don't: compile once, run many times, report compile-vs-run
// separately, best-of-N to suppress GC/JIT noise.
//
// Each program's top level IS its work (VL runs the program as the module's start
// function), so we compile the wasm once, JIT it once (`WebAssembly.compile`), then
// time repeated `instantiate` calls — each re-runs the start function. Read deltas
// between runs on the same machine, not absolute numbers.
//
// Run with:  deno run -A scripts/perf-runtime.ts

import { compile } from "../compiler/compile.ts";

type Bench = { name: string; src: string; runs: number };

// CPU-bound programs that exercise distinct codegen paths. Each prints one result
// so the work isn't dead-code-eliminated. Kept honest: real loops/recursion/heap.
const BENCHMARKS: Bench[] = [
  {
    name: "i32 sum loop (1e7)",
    src: [
      "let acc = 0",
      "let i = 0",
      "while i < 10000000 {",
      "  acc = acc + i",
      "  i = i + 1",
      "}",
      "print(acc)",
    ].join("\n"),
    runs: 30,
  },
  {
    name: "recursive fib(28)",
    src: [
      "function fib(n: i32): i32 {",
      "  if n < 2 { return n }",
      "  return fib(n - 1) + fib(n - 2)",
      "}",
      "print(fib(28))",
    ].join("\n"),
    runs: 30,
  },
  {
    name: "array push + sum (1e5)",
    src: [
      "let a = [0]",
      "let i = 0",
      "while i < 100000 {",
      "  a.push(i)",
      "  i = i + 1",
      "}",
      "let s = 0",
      "let j = 0",
      "while j < a.length {",
      "  s = s + a[j]",
      "  j = j + 1",
      "}",
      "print(s)",
    ].join("\n"),
    runs: 20,
  },
  {
    name: "string concat (5e3, O(n^2))",
    src: [
      "let s = \"\"",
      "let i = 0",
      "while i < 5000 {",
      "  s = s + \"x\"",
      "  i = i + 1",
      "}",
      "print(s.length)",
    ].join("\n"),
    runs: 20,
  },
];

// A fresh memory + no-op host imports per instantiate. The benchmarks call the
// `print` builtins (so the work stays live); we discard the output — we want the
// execution time, not the logs.
const makeImports = () => {
  const noop = () => {};
  return {
    imports: {
      memory: new WebAssembly.Memory({ initial: 1, maximum: 65536 }),
      __log_string__: noop,
      __log__: noop,
      __print_i32__: noop,
      __print_i64__: noop,
      __print_f32__: noop,
      __print_f64__: noop,
      __print_bool__: noop,
      __print_char__: noop,
      __print_str_flush__: noop,
    },
  };
};

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, error, warn });
  }
};

const ms = (n: number) => n.toFixed(2);
const pad = (s: string, w: number) => s.padEnd(w);
const padL = (s: string, w: number) => s.padStart(w);

const main = async () => {
  console.log("VL run-time perf baseline");
  console.log(
    "(best-of-N execution time of the emitted wasm; compile time shown for context)",
  );
  const rows: { name: string; compileMs: number; runMs: number; bytes: number }[] =
    [];
  for (const b of BENCHMARKS) {
    // Compile (best-of-3) — context only; this harness is about run time.
    let compileMs = Infinity;
    let wasm: Uint8Array | undefined;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const r = await quiet(() => compile(b.src));
      const t1 = performance.now();
      compileMs = Math.min(compileMs, t1 - t0);
      wasm = r.wasm;
      if (r.diagnostics.some((d) => d.severity === "error")) {
        console.error(`  ${b.name}: did not compile:`);
        for (const d of r.diagnostics.filter((d) => d.severity === "error")) {
          console.error("    " + d.message);
        }
        wasm = undefined;
        break;
      }
    }
    if (!wasm) continue;
    // JIT the module once; time repeated instantiation (each re-runs the program).
    const mod = await WebAssembly.compile(wasm as BufferSource);
    for (let k = 0; k < 3; k++) await WebAssembly.instantiate(mod, makeImports());
    let runMs = Infinity;
    for (let k = 0; k < b.runs; k++) {
      const im = makeImports();
      const t0 = performance.now();
      await WebAssembly.instantiate(mod, im);
      const t1 = performance.now();
      runMs = Math.min(runMs, t1 - t0);
    }
    rows.push({ name: b.name, compileMs, runMs, bytes: wasm.byteLength });
  }

  const nameW = Math.max(8, ...rows.map((r) => r.name.length));
  const header = [
    pad("benchmark", nameW),
    padL("run ms", 10),
    padL("compile ms", 12),
    padL("wasm B", 9),
  ].join("  ");
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log(
      [
        pad(r.name, nameW),
        padL(ms(r.runMs), 10),
        padL(ms(r.compileMs), 12),
        padL(r.bytes.toLocaleString("en-US"), 9),
      ].join("  "),
    );
  }
};

if (import.meta.main) await main();

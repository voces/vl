// Performance baseline harness for the VL compiler (ROADMAP Track F hygiene).
//
// Goal: turn "this change made compilation slower/bigger" from an argument into
// a measurement. For each input program it reports:
//   - compile time      — wall-clock of the PUBLIC `compile(source)` pipeline,
//     split into front end (`checkOnly`: tokenize + parse + typecheck) and
//     codegen (`compile - checkOnly`), since those are the two cheaply
//     separable phases the public API exposes.
//   - emitted wasm size — `wasm.byteLength` (0 when no wasm is produced).
//
// Inputs:
//   (a) the existing `.vl` corpus under `tests/cases/**`, skipping the
//       intentional error-fixtures (files with @error / @error-at directives,
//       i.e. those that don't compile cleanly), mirroring the test harness.
//   (b) a few generated synthetic stress programs (see SYNTHETIC below) that
//       exercise scale along different axes: many functions, deep nesting, a
//       large array build+iterate, and a big literal-union.
//
// This is INDICATIVE, not a microbenchmark. It runs a warmup plus a few timed
// iterations and reports the best (minimum) wall time per phase to suppress GC /
// JIT noise; absolute numbers vary by machine. Read deltas between runs on the
// same machine, not the raw figures.
//
// Read-only consumer of the compiler's public API — imports only `compile` /
// `checkOnly` from `compiler/compile.ts`; nothing under `compiler/` is modified.
//
// Run with:  deno task perf

import { checkOnly, compile } from "../compiler/compile.ts";

// ---------------------------------------------------------------------------
// Tuning knobs. Kept low so `deno task perf` finishes in a few seconds; bump
// ITERATIONS for steadier numbers at the cost of runtime.
// ---------------------------------------------------------------------------
const WARMUP = 1;
const ITERATIONS = 5;

const CASES_DIR = new URL("../tests/cases/", import.meta.url);

// ---------------------------------------------------------------------------
// Self-host source: the concatenated compiler front end used by the self-host
// pipeline test (`tests/selfhost_pipeline_test.ts`). This is the slowest real
// compile the test suite exercises — four `.vl` compiler source files joined
// with the same name-collision renaming the pipeline test applies, so the
// measurement matches what the CI pipeline actually compiles through binaryen.
// ---------------------------------------------------------------------------
const COMPILER_DIR = new URL("../compiler/", import.meta.url);

const readCompilerVl = (name: string): string =>
  Deno.readTextFileSync(new URL(name, COMPILER_DIR));

/** Build the concatenated self-host source (lexer + ast + parser + typecheck).
 *  The three name-collision renames mirror `selfhost_pipeline_test.ts` exactly.
 *
 *  Two variants:
 *   - withDriver=false (default): the raw library concat, no top-level calls.
 *     All definitions are dead-code-eliminated; wasm is a near-empty 48-byte
 *     stub. Useful for measuring front-end scaling on a large source.
 *   - withDriver=true: appends a minimal `print(0)` driver so the optimizer
 *     has live code to work with. This exercises the full binaryen IR build +
 *     optimize() path and matches what `selfhost_pipeline_test.ts` actually does
 *     (each test appends a driver before calling `compile`).
 */
const buildSelfHostSource = (withDriver = false): string => {
  const lexer = readCompilerVl("lexer.vl")
    .replace(/\bTok\b/g, "LexTok")
    .replace(/\bDiag\b/g, "LexDiag")
    .replace(/\badvance\b/g, "lexAdvance");
  const ast = readCompilerVl("ast.vl");
  const parser = readCompilerVl("parser.vl");
  const typecheck = readCompilerVl("typecheck.vl");
  const base = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck;
  if (!withDriver) return base;
  // Minimal driver: same shape as the pipeline test's `driverFor()` function —
  // calls `tokenize`, `parseProgram`, `checkProgram`, and prints the diag count.
  // This keeps enough live code to exercise real binaryen IR construction +
  // optimize() without adding further VL semantics complexity.
  const minimalDriver = `
function mapKind(k: string): string {
  if k == "ID" { return "IDENT" }
  k
}
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: mapKind(t.kind), text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
loadToks("let x = 1")
initChecker()
print(i32ToStr(checkProgram(parseProgram())))
`;
  return base + "\n" + minimalDriver;
};

type Sample = {
  name: string;
  group: "corpus" | "synthetic";
  bytesSource: number;
  frontMs: number; // best checkOnly time
  totalMs: number; // best full compile time
  codegenMs: number; // totalMs - frontMs (approx; both are best-of, so floor at 0)
  wasmBytes: number;
};

// ---------------------------------------------------------------------------
// Synthetic stress programs — generated at runtime to probe scaling. Each is a
// clean-compiling VL program (verified by the harness: a synthetic that fails to
// produce wasm is flagged in the output rather than silently skipped).
// ---------------------------------------------------------------------------

/** Many small functions: stresses per-declaration parse + symbol + codegen cost. */
const manyFunctions = (n: number): string => {
  const lines: string[] = [];
  // Name them `fn<i>` (not `f<i>`): `f32`/`f64` would collide with the built-in
  // float type names and raise a redeclaration error.
  for (let i = 0; i < n; i++) {
    lines.push(`function fn${i}(a: i32, b: i32) a + b * ${i % 7 + 1}`);
  }
  // Reference a handful so they aren't dead-code-eliminated away to nothing.
  lines.push(`let acc = 0`);
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 16))) {
    lines.push(`acc = acc + fn${i}(${i}, ${i + 1})`);
  }
  lines.push(`print(acc)`);
  return lines.join("\n");
};

/** A deeply-nested arithmetic expression: stresses recursive parse + typecheck. */
const deepExpression = (depth: number): string => {
  // ((((1 + 2) + 2) + 2) ...) — a left-leaning tree `depth` deep.
  let expr = "1";
  for (let i = 0; i < depth; i++) expr = `(${expr} + 2)`;
  return `let x = ${expr}\nprint(x)`;
};

/** Build then iterate a large array literal: stresses codegen of array.new_fixed. */
const largeArray = (n: number): string => {
  const elems: string[] = [];
  for (let i = 0; i < n; i++) elems.push(String(i % 1000));
  return [
    `let a = [${elems.join(", ")}]`,
    `let s = 0`,
    `for i in 0 to ${n - 1} {`,
    `  s = s + a[i]`,
    `}`,
    `print(s)`,
  ].join("\n");
};

/** A big literal-union parameter type: stresses union construction + narrowing. */
const bigLiteralUnion = (n: number): string => {
  const members: string[] = [];
  for (let i = 0; i < n; i++) members.push(String(i));
  const lines: string[] = [];
  lines.push(`function pick(x: ${members.join(" | ")}): i32 {`);
  // An if/else-if chain over the members so each one is discriminated.
  for (let i = 0; i < n; i++) {
    const head = i === 0 ? "if" : "else if";
    lines.push(`  ${head} x == ${i} { return ${i * 2} }`);
  }
  lines.push(`  return -1`);
  lines.push(`}`);
  lines.push(`print(pick(0))`);
  lines.push(`print(pick(${n - 1}))`);
  return lines.join("\n");
};

type Synthetic = { name: string; source: string };

const SYNTHETIC: Synthetic[] = [
  { name: "many-functions (300)", source: manyFunctions(300) },
  { name: "deep-expression (500)", source: deepExpression(500) },
  { name: "large-array (2000)", source: largeArray(2000) },
  // Kept at 120 (not larger): literal-union compile time is strongly
  // superlinear (~cubic — see report), so a bigger size dominates the whole
  // run. 120 still makes the cost visible without ballooning `deno task perf`.
  { name: "big-literal-union (120)", source: bigLiteralUnion(120) },
];

// ---------------------------------------------------------------------------
// Corpus discovery: walk tests/cases/**, skip error-fixtures and @skip files.
// ---------------------------------------------------------------------------

const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};

/** True if the file declares an expected error (won't produce wasm) or is skipped. */
const isErrorFixture = (src: string): boolean => {
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("//")) continue;
    const m = line.slice(2).trim().match(/^@(\S+)/);
    if (!m) continue;
    const key = m[1];
    if (key === "error" || key === "error-at" || key === "skip") return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Measurement. `checkOnly` is synchronous; `compile` is async. We measure the
// best (minimum) wall time across iterations to suppress GC/JIT noise.
// ---------------------------------------------------------------------------

/** Silence the compiler's internal console noise during measurement. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, error, warn });
  }
};

const measure = async (
  name: string,
  group: Sample["group"],
  source: string,
): Promise<Sample & { errored: boolean }> => {
  // Warmup (also surfaces whether this source actually compiles).
  let lastWasm: Uint8Array | undefined;
  let errored = false;
  for (let i = 0; i < WARMUP; i++) {
    checkOnly(source);
    const r = await quiet(() => compile(source));
    lastWasm = r.wasm;
    errored = r.diagnostics.some((d) => d.severity === "error");
  }

  let frontMs = Infinity;
  let totalMs = Infinity;
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    checkOnly(source);
    const t1 = performance.now();
    await quiet(() => compile(source));
    const t2 = performance.now();
    frontMs = Math.min(frontMs, t1 - t0);
    totalMs = Math.min(totalMs, t2 - t1);
  }

  return {
    name,
    group,
    bytesSource: new TextEncoder().encode(source).length,
    frontMs,
    totalMs,
    codegenMs: Math.max(0, totalMs - frontMs),
    wasmBytes: lastWasm?.byteLength ?? 0,
    errored,
  };
};

// ---------------------------------------------------------------------------
// Table rendering.
// ---------------------------------------------------------------------------

const pad = (s: string, w: number): string => s.padEnd(w);
const padL = (s: string, w: number): string => s.padStart(w);
const ms = (n: number): string => n.toFixed(2);
const fmtBytes = (n: number): string => n.toLocaleString("en-US");

const printTable = (title: string, rows: Sample[]): void => {
  const cols = {
    name: Math.max(title.length, ...rows.map((r) => r.name.length), 4),
    front: 9,
    codegen: 9,
    total: 9,
    wasm: 12,
  };
  const header = [
    pad("program", cols.name),
    padL("front ms", cols.front),
    padL("codegen ms", cols.codegen),
    padL("total ms", cols.total),
    padL("wasm bytes", cols.wasm),
  ].join("  ");
  const rule = "-".repeat(header.length);

  console.log(`\n${title}`);
  console.log(rule);
  console.log(header);
  console.log(rule);
  for (const r of rows) {
    const name = r.wasmBytes === 0 ? `${r.name} (no wasm!)` : r.name;
    console.log(
      [
        pad(name, cols.name),
        padL(ms(r.frontMs), cols.front),
        padL(ms(r.codegenMs), cols.codegen),
        padL(ms(r.totalMs), cols.total),
        padL(fmtBytes(r.wasmBytes), cols.wasm),
      ].join("  "),
    );
  }
  // Totals.
  const sum = (pick: (r: Sample) => number) =>
    rows.reduce((a, r) => a + pick(r), 0);
  console.log(rule);
  console.log(
    [
      pad(`TOTAL (${rows.length})`, cols.name),
      padL(ms(sum((r) => r.frontMs)), cols.front),
      padL(ms(sum((r) => r.codegenMs)), cols.codegen),
      padL(ms(sum((r) => r.totalMs)), cols.total),
      padL(fmtBytes(sum((r) => r.wasmBytes)), cols.wasm),
    ].join("  "),
  );
};

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  console.log("VL compiler performance baseline");
  console.log(
    `(indicative — warmup ${WARMUP}, best-of ${ITERATIONS} iterations; ` +
      `compile time is wall-clock of the public compile()/checkOnly())`,
  );

  // Corpus.
  const corpusFiles: URL[] = [];
  for await (const f of walk(CASES_DIR)) corpusFiles.push(f);
  corpusFiles.sort((a, b) => a.href.localeCompare(b.href));

  const corpusRows: Sample[] = [];
  let skipped = 0;
  for (const file of corpusFiles) {
    const src = await Deno.readTextFile(file);
    if (isErrorFixture(src)) {
      skipped++;
      continue;
    }
    const name = file.href.slice(CASES_DIR.href.length);
    const s = await measure(name, "corpus", src);
    if (s.errored) {
      // A clean-expected fixture that didn't compile — note it but don't crash.
      console.error(`  warning: corpus file did not compile cleanly: ${name}`);
    }
    corpusRows.push(s);
  }

  // Synthetic.
  const synthRows: Sample[] = [];
  for (const syn of SYNTHETIC) {
    const s = await measure(syn.name, "synthetic", syn.source);
    if (s.errored) {
      console.error(`  warning: synthetic program failed to compile: ${syn.name}`);
    }
    synthRows.push(s);
  }

  // Self-host pipeline: the concatenated compiler front-end sources that the
  // test suite's `selfhost_pipeline_test.ts` compiles. This is the single
  // largest input VL processes, and is where most CI time is spent. We measure
  // it separately so the bottleneck analysis (front end vs codegen/binaryen) is
  // clearly attributed.
  //
  // Two variants:
  //  A) library-only (no driver): front-end scales with source size; binaryen
  //     IR is built for all ~800 declarations but optimizer has no live code so
  //     the emitted wasm is a near-empty stub (~48 bytes). Front-end time is
  //     accurate; codegen is dominated by IR construction, not optimize().
  //  B) with driver: adds minimal top-level calls so the optimizer has live
  //     code to work on. This closely mirrors what the pipeline test does for
  //     each of its 5 sub-tests. Codegen time here includes real optimize() work
  //     on the full self-hosted module.
  //
  // We run 2 timed iterations (instead of ITERATIONS=5) to keep `deno task perf`
  // reasonably fast while still getting a useful best-of measurement.
  const SELFHOST_ITERATIONS = 2;

  const measureSelfHost = async (
    label: string,
    source: string,
  ): Promise<Sample> => {
    const bytes = new TextEncoder().encode(source).length;
    console.log(`\n[self-host] ${label}: ${fmtBytes(bytes)} bytes source`);
    console.log("[self-host] warming up (1 compile)...");
    checkOnly(source);
    const warmR = await quiet(() => compile(source));
    if (warmR.diagnostics.some((d) => d.severity === "error")) {
      console.error(`[self-host] ERROR in ${label}:`);
      for (const d of warmR.diagnostics.filter((d) => d.severity === "error")) {
        console.error("  " + d.message);
      }
    }
    console.log(`[self-host] timing (${SELFHOST_ITERATIONS} iterations)...`);
    let frontMs = Infinity;
    let totalMs = Infinity;
    let lastWasm: Uint8Array | undefined = warmR.wasm;
    for (let i = 0; i < SELFHOST_ITERATIONS; i++) {
      const t0 = performance.now();
      checkOnly(source);
      const t1 = performance.now();
      const r = await quiet(() => compile(source));
      const t2 = performance.now();
      frontMs = Math.min(frontMs, t1 - t0);
      totalMs = Math.min(totalMs, t2 - t1);
      lastWasm = r.wasm ?? lastWasm;
    }
    return {
      name: label,
      group: "synthetic",
      bytesSource: bytes,
      frontMs,
      totalMs,
      codegenMs: Math.max(0, totalMs - frontMs),
      wasmBytes: lastWasm?.byteLength ?? 0,
    };
  };

  console.log("\n[self-host] building concatenated compiler source...");
  const shLibrarySource = buildSelfHostSource(false);
  const shDriverSource = buildSelfHostSource(true);

  const shLibraryRow = await measureSelfHost(
    "selfhost: library-only (no driver, dead-code-elim)",
    shLibrarySource,
  );
  const shDriverRow = await measureSelfHost(
    "selfhost: with driver (mirrors pipeline-test compile)",
    shDriverSource,
  );

  const selfHostRows: Sample[] = [shLibraryRow, shDriverRow];

  printTable(
    `CORPUS  (tests/cases/**; ${corpusRows.length} compiled, ${skipped} error/skip fixtures excluded)`,
    corpusRows,
  );
  printTable("SYNTHETIC  (generated stress programs)", synthRows);
  printTable(
    "SELF-HOST  (compiler front-end — the slow pipeline-test input)",
    selfHostRows,
  );

  // Bottleneck analysis for the self-host module.
  // Use the driver variant (shDriverRow) as the representative slow case —
  // it exercises full binaryen IR construction + optimize() + emit, which is
  // what the pipeline test does for each of its 5 sub-tests.
  const rep = shDriverRow;
  const shFrontPct = rep.frontMs / rep.totalMs * 100;
  const shCodegenPct = rep.codegenMs / rep.totalMs * 100;
  console.log("\nSELF-HOST BOTTLENECK ANALYSIS (driver variant — mirrors pipeline test)");
  console.log("-".repeat(70));
  console.log(
    `  source input   : ${fmtBytes(rep.bytesSource)} bytes`,
  );
  console.log(
    `  wasm output    : ${fmtBytes(rep.wasmBytes)} bytes`,
  );
  console.log(
    `  front end      : ${ms(rep.frontMs)} ms  (${shFrontPct.toFixed(1)}% of total)` +
      `  [checkOnly: lex+parse+typecheck, no binaryen]`,
  );
  console.log(
    `  codegen+opt    : ${ms(rep.codegenMs)} ms  (${shCodegenPct.toFixed(1)}% of total)` +
      `  [toWasm IR build + binaryen optimize() + emit]`,
  );
  console.log(
    `  total (best-of ${SELFHOST_ITERATIONS}) : ${ms(rep.totalMs)} ms`,
  );
  console.log(
    `\n  library-only variant (no driver, dead-code elim):`,
  );
  console.log(
    `    front end: ${ms(shLibraryRow.frontMs)} ms | codegen: ${
      ms(shLibraryRow.codegenMs)
    } ms | total: ${ms(shLibraryRow.totalMs)} ms | wasm: ${
      fmtBytes(shLibraryRow.wasmBytes)
    } bytes`,
  );
  console.log(
    `    (codegen time here = IR build for all declarations; optimize() trivial` +
      ` because no live code)`,
  );
  if (shCodegenPct > 66) {
    console.log(
      `\n  FINDING: codegen/binaryen dominates (${shCodegenPct.toFixed(0)}% of compile time` +
        ` in the driver variant).`,
    );
    console.log(
      `           The IR build + binaryen optimize() on the live self-host module`,
    );
    console.log(
      `           accounts for the bulk of each pipeline-test compile (~4-8 s per test).`,
    );
    console.log(
      `  RECOMMENDATION: add a --no-optimize / skip-optimize test mode to binaryen`,
    );
    console.log(
      `           codegen so tests can skip the slow optimize() pass (correctness`,
    );
    console.log(
      `           is unaffected — the wasm still runs; only size/speed differ).`,
    );
  } else if (shFrontPct > 50) {
    console.log(
      `\n  FINDING: front end dominates (${shFrontPct.toFixed(0)}% of compile time).`,
    );
    console.log(`           Optimize large source files or cache front-end results.`);
  } else {
    console.log(`\n  FINDING: front end and codegen are roughly balanced.`);
  }

  // Summary: slowest + biggest, plus grand totals.
  const all = [...corpusRows, ...synthRows, ...selfHostRows];
  const slowest = [...all].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5);
  const biggest = [...all].sort((a, b) => b.wasmBytes - a.wasmBytes).slice(0, 5);

  console.log("\nSUMMARY");
  console.log("-".repeat(40));
  console.log(`programs measured : ${all.length}`);
  console.log(
    `total compile     : ${ms(all.reduce((a, r) => a + r.totalMs, 0))} ms`,
  );
  console.log(
    `total wasm        : ${fmtBytes(all.reduce((a, r) => a + r.wasmBytes, 0))} bytes`,
  );
  console.log("\nslowest 5 (total ms):");
  for (const r of slowest) console.log(`  ${ms(r.totalMs).padStart(8)}  ${r.name}`);
  console.log("\nbiggest 5 (wasm bytes):");
  for (const r of biggest) {
    console.log(`  ${fmtBytes(r.wasmBytes).padStart(10)}  ${r.name}`);
  }
};

if (import.meta.main) await main();

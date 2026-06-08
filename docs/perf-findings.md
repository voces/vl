# VL Compiler — Test-Suite Parallelisation & Perf Findings

Date: 2026-06-07  
Branch: `claude/perf-test-parallel`

---

## Part 1 — Test-Suite Parallelisation (`--parallel`)

### Change

Added `--parallel` to the `test` task in `deno.json`:

```
"test": "deno test -A --no-check --parallel tests/"
```

Deno runs test **files** concurrently across OS threads when this flag is set.
The worker count is controlled by the `DENO_JOBS` environment variable (defaults
to the number of CPUs); no hardcoded value was set.

### Parallel-Safety Audit

All test files were checked for shared-state hazards (fixed temp-file paths, global
mutated singletons, etc.):

- `cli_severity_test.ts` — uses `Deno.makeTempDir({ prefix: "vl_sev_" })` per
  call: unique per-run, parallel-safe.
- `cli_excludes_test.ts` — uses `Deno.makeTempDir({ prefix: "vl_excl_" })` per
  test: unique per-run, parallel-safe.
- All other test files are pure in-memory (no filesystem writes).

**No test files required modification** — the suite was already parallel-safe.

### Results

| run | wall-clock | tests |
|-----|-----------|-------|
| baseline (sequential) | **69.9 s** | 761 passed |
| parallel (`--parallel`) | **40–52 s** | 761 passed |

Speedup: roughly **25–43%** wall-clock reduction (varies by machine load; runs
observed between 40 s and 52 s, vs 70 s baseline). All 761 tests pass.

The self-host tests (`selfhost_pipeline_test.ts`, `selfhost_typecheck_test.ts`,
`selfhost_lexer_test.ts`, `selfhost_parser_test.ts`) still dominate wall time even
when parallelised because they compile through binaryen — see Part 2.

---

## Part 2 — Compile-Time Breakdown

### Method

`scripts/perf.ts` was extended to measure:

1. **Front end** — `checkOnly(source)`: synchronous lex + parse + typecheck, no
   binaryen.
2. **Codegen + opt** — `compile(source)` minus `checkOnly(source)`: dynamic import
   of `toWasm.ts` + binaryen IR construction + `m.optimize()` + `m.emitBinary()`.

All timings are best-of-N wall-clock iterations using `performance.now()`, with one
warmup run discarded to absorb JIT / module-load noise.

The self-host source was measured in two configurations:

- **Library-only** (no driver): raw `lexer.vl + ast.vl + parser.vl + typecheck.vl`
  concatenated, no top-level calls. Dead-code elimination in binaryen removes
  everything; wasm output is a ~48-byte stub. Codegen is dominated by IR
  construction, not `optimize()`.
- **With driver** (mirrors pipeline test): same concat + a minimal top-level
  `loadToks / parseProgram / checkProgram / print` call sequence, matching the
  shape of each sub-test in `selfhost_pipeline_test.ts`. This produces real live
  code for binaryen to optimize (23 KB wasm).

### Results Table

Numbers are best-of-2 (self-host) / best-of-5 (corpus/synthetic) wall-clock on
this machine. Read deltas between runs on the same machine, not absolute values.

#### Self-Host Module

| variant | source bytes | front ms | codegen ms | total ms | wasm bytes |
|---------|-------------|----------|-----------|----------|-----------|
| library-only (no driver) | 67,319 | ~53 ms | ~91 ms | ~144 ms | 48 |
| **with driver (pipeline test)** | 67,710 | **~53 ms** | **~4,016 ms** | **~4,069 ms** | 23,099 |

#### Corpus Summary (209 files from `tests/cases/**`)

| metric | value |
|--------|-------|
| front-end total | ~60 ms |
| codegen total | ~1,279 ms |
| total compile | ~1,339 ms |
| wasm total | 67,479 bytes |

#### Synthetic Stress Programs

| program | front ms | codegen ms | total ms | wasm bytes |
|---------|----------|-----------|----------|-----------|
| many-functions (300) | ~5 ms | ~9 ms | ~14 ms | 417 |
| deep-expression (500) | ~2 ms | ~8 ms | ~11 ms | 119 |
| large-array (2000) | ~4 ms | ~23 ms | ~28 ms | 6,066 |
| big-literal-union (120) | ~1,168 ms | ~380 ms | ~1,547 ms | 1,726 |

### Key Finding: binaryen `optimize()` Dominates Self-Host Compile Time

The library-only variant shows that building the binaryen IR for the full set of
~800 declarations costs only ~91 ms of codegen. When a driver is added (live code
to optimize), codegen jumps to **~4,016 ms** — a **44× increase** in codegen time
for adding ~391 bytes of source.

This confirms that **binaryen `m.optimize()` on a large live module is the
bottleneck**, not the VL front end or IR construction. The front end is consistently
~53 ms regardless of the driver, confirming it scales reasonably with source size.

Each of the 5 sub-tests in `selfhost_pipeline_test.ts` calls `compile()` on the
full concatenated source + its own driver. With `--parallel`, the four selfhost
test files run concurrently, but within each file the tests still run sequentially —
and each `compile()` call hits binaryen.

Estimated selfhost cost per test file (5 sub-tests × ~4 s each):
- `selfhost_pipeline_test.ts` — ~20 s (5 × 4 s)
- `selfhost_typecheck_test.ts` — similar (slightly smaller source, still binaryen-heavy)
- `selfhost_lexer_test.ts` — smaller source, faster
- `selfhost_parser_test.ts` — smaller source, faster

The wall time is gated by the longest-running selfhost file at ~20–25 s even with
parallelism.

---

## Part 3 — Recommendations

### High-Impact: Skip `optimize()` in Test Compiles

The single highest-leverage fix is to make binaryen's `optimize()` call optional
for test compiles. The wasm output is functionally correct without optimization —
all existing tests run wasm and check its observable output, not the binary size or
execution speed. Skipping `optimize()` would reduce each selfhost sub-test from
~4 s to ~0.14 s (IR construction time only), cutting total test time by ~20–25 s.

**Concrete approach**: add a `noOptimize` option to `toWasm()` (or read an env var
`VL_NO_OPT=1`), then set it in test helpers or via the test runner environment.
This touches only `compiler/toWasm.ts` (owned by another agent — do not implement
here).

### Medium-Impact: Cache the Binaryen Module Across Sub-Tests

Each `selfhost_pipeline_test.ts` sub-test calls `compile()` on the same base
source (lexer + ast + parser + typecheck) with only the driver suffix differing.
If the binaryen IR for the shared base could be cached and cloned per sub-test,
only the driver delta would need re-compiling. This is a more involved change
(binaryen modules are not trivially cloneable) but would reduce the 5×4 s to
roughly 1×4 s + 4×driver-only compiles.

### Low-Impact: `DENO_JOBS` Tuning

The current parallelisation fully exploits available CPU cores. No further tuning
is needed unless running on a machine with >8 cores; the bottleneck is single-core
binaryen optimize() within each file, not cross-file concurrency.

### Front-End Scaling (Future)

The front end (lex + parse + typecheck) is ~53 ms for the 67 KB self-host source —
well within acceptable range. The `big-literal-union (120)` synthetic showed the
front end as superlinear — **RESOLVED** (see the 2026-06-08 section below).

---

## Compile-time follow-ups (2026-06-08)

A second compile-time pass, with the bootstrapping lens: only fixes to **shared
front-end / algorithm logic** carry to the eventual `typecheck.vl`; binaryen-specific
costs do not (though per ROADMAP H4 the optimize step persists at self-host as
external `wasm-opt`, so it isn't pure throwaway either).

- **Literal-union cubic — FIXED.** `flattenType` deduped union variants pairwise
  (O(n²)) while the parser folds `|` left-associatively (re-flatten per `|`) → O(n³).
  An all-literal value-key dedup fast path makes it O(n²): 160 members 485 ms →
  3.8 ms. Shared logic — carries to `typecheck.vl`. (CHANGELOG A16; `tests/cases/
  types/literal-union-dedup.vl`.)
- **Front end is otherwise linear.** Scaling compiler-shaped patterns (many
  functions / type aliases / locals / object fields / statements / calls / nesting)
  at N vs 2N shows ~linear growth; the only superlinear cases — long if/else-if
  chains (O(n^1.4)) and deeply-nested object types — only bite at unrealistic sizes
  (hundreds of arms / 150+ nesting). No remaining front-end cliff.
- **Leaner-IR (feed binaryen smaller IR) — INVESTIGATED, NOT WORTH IT.** binaryen
  `optimize()` removes 2.4–6.8× of our emitted IR, but that is its *designed* job
  (block / temp-local cleanup, Heap2Local); pre-empting it reimplements binaryen
  passes (against the "don't step on binaryen's feet" stance). Our own `toWasm` IR
  build is **linear** (no quadratic to fix). The optimize-time superlinearity on a
  large function is **binaryen-internal** — it scales with function body size, not
  with any specific IR pattern (verified: many-distinct-locals vs few-reused-locals
  optimize identically). No clean leaner-emission win. Don't re-investigate without
  a profiler pointing at a specific binaryen pass our IR shape pessimizes.
- **~400 ms per light test = the binaryen bundle load, not the compile.** The first
  `compile()` in a worker pays ~333 ms (≈240 ms to instantiate the 13 MB `binaryen`
  npm bundle — already V8-code-cached; ~379 ms with `--no-code-cache` — plus ~20 ms
  Module/optimize/emit); subsequent compiles are ~0.9 ms. Under `--parallel` the
  concurrent per-worker inits saturate cores and inflate every light test's reported
  wall time. Paid once per worker that runs a codegen (`@run`) case; `checkOnly` and
  front-end-error cases never load binaryen (`toWasm` is a lazy dynamic import). Near
  the floor (the bundle size is the cost) and it disappears at self-host (binaryen.js
  → external `wasm-opt`). Not worth chasing.

---

## Files Changed

| file | change |
|------|--------|
| `deno.json` | Added `--parallel` to `test` task |
| `scripts/perf.ts` | Added self-host source measurement (library + driver variants), bottleneck analysis, updated summary |
| `docs/perf-findings.md` | This document |

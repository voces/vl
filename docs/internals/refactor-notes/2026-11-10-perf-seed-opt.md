# The published seed is binaryen `-O` without inlining, 2026-11-10

The perf lane found that `wasm-opt -O` on `build/vl-compiler.wasm` cuts L2 fuel by about 13% and
the seed by about 8%. The rebuilt compiler's output was byte-identical. This lane measured what that
costs and adopted the part that pays. Base is master `bcf337c7` (#7060). The fixpoint X is
6,601,413 bytes, proven by two refreshes that wrote identical bytes. Box: 4 cores, 15 GiB, load
under 2 for every timing. binaryen is native 130 (`scripts/fetch-binaryen.sh`) unless named.

## 1. What the optimizer step costs and what it saves

| seed | bytes | wasm-opt wall / CPU | L2 fuel | self-build wall (mean) | cold JIT wall / CPU |
| --- | --- | --- | --- | --- | --- |
| X (fixpoint) | 6,601,413 | none | 81.58G | 23.0 s (3 runs) | 7.6-8.2 / 20.5 s |
| `wasm-opt -O` (raw) | 4,855,073 | 17.6 / 53 s | 71.89G | 22.0 s (2 runs, X 22.2) | 6.1-6.8 / 18.8 s |
| `vl build -O` (rung: `--always-inline-max-function-size 16 -O`) | 6,061,253 | +27.7 wall / +73 CPU over a plain build | 71.13G | 21.6 s (2 runs) | not measured |
| `wasm-opt --no-inline=* -O` | 5,098,108 | 8.6 / 28 s | 72.61G | 21.5 s (3 runs) | not measured |

npm's `node_modules/.bin/wasm-opt` is the JS build. It writes the same bytes as native 130 (`cmp`)
but takes 119-122 s for raw `-O`.

All four seeds compile `compiler/entry.vl` to X byte for byte. Every form is deterministic:
two runs gave identical bytes for each of the three optimized forms, and raw `-O` was also identical
at `BINARYEN_CORES=1` and `=4`.

**Per refresh this is a net loss.** A refresh does one self-build and saves at most 1.5 s of
wall. The cheapest optimizer step costs 8.6 s of wall and 28 s of CPU. So the refresh stays
unoptimized, and only the published seed takes the step.

## 2. Plain `-O` is a runs → not-runs on V8

The corpus oracle (`tests/cases_wasm_{0..3}_test.ts`) runs the seed under V8. The playground
runs the published seed the same way.

| seed under the oracle | passed | failed |
| --- | --- | --- |
| X | 7,400 | 0 |
| raw `-O` | 7,396 | 4 |
| `vl build -O` | 7,396 | 4 |
| `--no-inline=* -O` | 7,400 | 0 |

There is one root failure. `expressions/long-operator-chain.vl` (700-term `+` chain) fails with
`RangeError: Maximum call stack size exceeded`. The three `generics/error-*` cells after it fail
because they share the aborted instance; run alone under `--filter generics/`, all 943 pass.
Smallest `--v8-flags=--stack-size` (KB) at which the long chain passes:

| seed | fails at | passes at |
| --- | --- | --- |
| X | 550 | 600 |
| `vl build -O` | 984 (V8's default) | 1200 |
| `--no-inline=* -O` | not reached | 600 |

The difference is V8-only. The vl host gives the seed a 512 MiB wasm stack, and `vl check`
output on all four cells is identical between X and `vl build -O`. Inlining is what grows the
frames. `--no-inline=*` gives back the stack and keeps 9.0G of the 10.5G fuel fall.

## 3. What changed

* `scripts/optimize-seed.sh <fixpoint> <out>` runs `wasm-opt --no-inline=* -O` with the host's
  `BINARYEN_FEATURES`. The result is refused unless it compiles the compiler back to the fixpoint
  byte for byte and runs `6 * 7`.
* `publish-seed.yml` optimizes after the existing gates. It runs the corpus oracle on the
  optimized bytes, swapped into `build/` and put back on exit, so the seed cache keeps X. It then
  publishes from `$RUNNER_TEMP/publish`. `seed-fingerprint.txt` gains `fixpoint-sha256`.
* `package.json` pins `binaryen` to `130.0.0`, not `^130.0.0`, and `deno.lock` follows.

## 4. What did not change, and why

* `refresh-compiler.sh`, the `seed` job's `--prove-fixpoint`, `ci-proven-seed.sh`, the seed cache:
  all keep X. A fetched optimized seed self-compiles to X. On a cold cache with unchanged source,
  `--prove-fixpoint` climbs one more rung (`compile(next) == next`) than it would from X.
* Ratchets: `seed-size`, `self-compile-time`, `plumb-shape-cost` and `late-demands` read X, so
  no baseline moves. A machine that grades against an unrefreshed fetched seed reads smaller
  numbers, and every ratchet passes a fall.
* `--names`: the debug seed is built from source and never optimized. Built by the optimized seed
  or by X, it is the same 10,444,828 bytes, and it runs.

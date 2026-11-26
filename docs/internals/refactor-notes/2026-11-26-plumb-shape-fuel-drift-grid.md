# plumb-shape-cost fuel: where the +4.5% since the 554710d8 baseline came from (lane INFRA, 2026-11-26)

`scripts/plumb-shape-baseline.json` (written at 554710d8, 2026-11-23: main 10,078,176,502, tail
7,310,901,187) stood at +4.3% on master 7d3f3e55 (START-2), under the +5% bar. This note
attributes the rise over a coarse grid, then refreshes the two fuel figures.

The rise is spread over the 374 compiler-touching merges since the baseline, with no interval
standing out, and main and tail rise in lockstep: it is the compiler's own per-function cost
while the IR and legacy coexist (the IR builds and lowers every function legacy still keeps
code for), not a change in the code either unit generates.

## Measurements

Each figure is the guest fuel of `vl build --names -O --import-memory` of the unit (sha
959003b50991f06d / d4be8bf105572223, the baseline's own) with that commit's fixpoint compiler (L2:
the tree's compiler built by a fixed seed, then by itself). The first point reproduces the old
baseline to 2,584 fuel.

| interval (compiler-touching merges) | main at end | rise | tail at end | rise |
|---|---:|---:|---:|---:|
| 554710d8 (the baseline) | 10,078,173,918 | | 7,310,898,603 | |
| → d8c0d583a (62) | 10,144,568,859 | +66.4M (+0.66%) | 7,357,982,081 | +47.1M |
| → 490fadee7 (62) | 10,230,872,979 | +86.3M (+0.86%) | 7,419,887,872 | +61.9M |
| → 2c6a4c846 (62) | 10,340,241,763 | +109.4M (+1.09%) | 7,500,678,718 | +80.8M |
| → b99a1fcbe (62) | 10,393,110,902 | +52.9M (+0.52%) | 7,537,918,925 | +37.2M |
| → bf3c11d34 (62) | 10,473,807,619 | +80.7M (+0.80%) | 7,597,058,457 | +59.1M |
| → 9b4bfbfc4 (64) | 10,530,489,460 | +56.7M (+0.56%) | 7,638,059,716 | +41.0M |

The largest interval is about twice the smallest; no single PR owns the rise.

## Refresh

From master e7cc2f142's fixpoint seed: main 10,530,491,852 (+4.49%), tail 7,638,062,108 (+4.47%).
Only the two fuel figures and the commit change: this host has no GNU `time` and no `wasm-opt`,
so `--write-baseline` here would null the RSS, CPU and `wasm-opt` readings the i9 baseline host
recorded (CPU is graded only on that host).

## Trajectory

At I8 the legacy half goes, so the per-function cost should fall back; the regeneration-8
dress rehearsal (#10096) reads plumb-shape-cost green against the old baseline.

## Method

`plumb-one.sh <sha>` extracts the commit's `compiler/` and `std/` with `git archive`, builds L1
and L2 as for the seed-size grid (2026-11-25-seed-size-drift-grid.md), and reads `[fuel] guest:`
of each unit's build under `$VL_FUEL=1`, one build at a time.

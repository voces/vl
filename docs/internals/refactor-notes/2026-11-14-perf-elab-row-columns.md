# Elab bank presence as node columns, 2026-11-14

Lane P, hit-list item 2 of `2026-11-14-perf-plumb-drift.md`. Base is master `f11563a9`, a
fixpoint. Fuel is `$VL_FUEL=1` guest fuel. Plumb runs `--names -O --import-memory` with `wasm-opt`
stubbed.

## The frame

`scopeTyAt` asks `elabRecorded` at every typed read. `elabRecorded` probed `elabNodeTys` for the
node, then `nodeSrc`, then `elabNodeTys` again for the source node. `elabNarrowedFromAt` asked
the same of `elabNodeTys` and `elabNodeNarrowed` through `elabHasPairs`. On the profile of
`f11563a9`, `elabRecorded` is 1.87% inclusive of plumb main and 0.85% of the L2 self-compile, and
`elabHasPairs` is 0.85% and 0.44%. Both are mostly `__map_probe_i32__`.

## The change

`elabRowNote` keeps a boolean column per bank beside the two writers of `elabNodeTys` and the
two of `elabNodeNarrowed`, and the bank reset clears it. `elabTyRecorded` and
`elabNarRecorded` read the column. When the column is empty they answer without probing
`nodeSrc`, which is the common case on a program with no generic instance. A negative key, the
`nodeSrc[ix] ?? -1` miss, still asks the map, so each answer is the map's. Every write pushes
before it stores, so a present row is never an empty list, and `elabHasPairs`'s length test was
a presence test. `elabHasPairs` and the `elabRecorded` wrapper are deleted.

## Measurements

| unit | fuel before | fuel after | Δ |
| --- | ---: | ---: | ---: |
| plumb main | 9,272,564,388 | 8,965,415,450 | −3.31% |
| plumb tail | 6,717,251,401 | 6,495,689,145 | −3.30% |
| L2 self-compile | 86,767,504,514 | 84,977,116,399 | −2.06% |

The fall is larger than the two frames' sampled share. Each probe that missed also paid
`nodeSrc`'s, and a 1 ms sampler under-counts short leaf calls.

CPU is user+sys, the median of 10 warm runs over two interleaved rounds. Peak RSS comes from
`getrusage`, and peak live from `VL_GC_STATS=1`.

| unit | CPU before | CPU after | peak RSS | peak live |
| --- | ---: | ---: | ---: | ---: |
| plumb main | 3.60 s | 3.63 s | 313.6 → 313.5 MB | 117.5 → 117.5 MiB |
| plumb tail | 2.17 s | 2.05 s | 311.5 → 311.4 MB | 77.8 → 77.8 MiB |
| L2 self-compile | 32.9 s | 32.8 s | 4,162 → 4,162 MB | 987.4 → 987.4 MiB |

**CPU does not move measurably.** On this VM a median moves ±2% between rounds, so a 2–3% fuel
fall is under the noise. The removed work is a hash probe, many guest instructions that the JIT
runs cheaply, so fuel overstates its time. The seed shrinks no code.

Seed 6,830,554 → 6,830,918 bytes (+364, +0.005%). Sweep, `f11563a9` against the candidate:
24,692 same, 0 bytes-only movers, 0 output movers. `regress.vl`: no runs lost.

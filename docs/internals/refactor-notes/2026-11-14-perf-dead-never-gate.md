# The dead-read walk runs only once a name can read `never`, 2026-11-14

Lane P, hit-list item 1 of `2026-11-14-perf-plumb-drift.md`. Base is master `b09064ce`, a
fixpoint. Fuel is `$VL_FUEL=1` guest fuel. Plumb runs `--names -O --import-memory` with `wasm-opt`
stubbed.

## The cost

#7944 (D16006) put `exprReadsDeadNever` at the top of every `emitExpr`. It walks the expression
asking `nodeTyAt` for its names and calls, and on #8053's base it cost 1.13% of the plumb main
unit. It answers true only where a name read is checked `never`, and `never` is legal only as a
declared return type. So a read is `never` in one of two cases. Either the check bound the name
at `never` (D16006's dead arm, through narrowing or a binding inside it), or an instance key binds
a type parameter at a type mentioning `never` (D3178, D14802). Everywhere else the answer is false.
A generic call or an un-annotated lambda handed a `never` call's result is refused before emit
(D16260, D16261).

## The change

The facts are recorded where they are decided:

* `envBind`, the one writer of a binding's type in the scope chain, notes a binding at `never`
  (`neverBindNote`). `nodeTySet` and the instanced column note a name read typed `never`. The note
  is forgotten with the node types it describes (`neverReadsReset`, at both `nodeTyIx` resets).
* The elaboration notes an instance key whose type arguments mention `never` when it pushes the key
  (`elabNeverKeyNote`), and forgets it with the keys.

`exprReadsDeadNever` returns false while neither note is set. Otherwise it walks as before.

**Exactness, checked directly.** A scratch compiler with the gate closed but the walk still asked,
failing with a marker wherever the walk would have answered true, was swept over all 24,734
programs. There were 0 markers. Without the gate the walk fires on 3 programs (two `tests/cases`
files and D3178's witness), and each sets one of the notes.

## Measurements

CPU is user+sys, the median of 10 warm runs over two interleaved rounds. Peak RSS comes from
`getrusage`, and peak live from `VL_GC_STATS=1`.

| unit | fuel before | fuel after | Δ | CPU | peak RSS | peak live |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| plumb main | 9,018,294,352 | 8,955,770,870 | −0.69% | 3.51 → 3.54 s | 313.7 → 313.7 MB | 117.4 → 117.4 MiB |
| plumb tail | 6,533,726,390 | 6,488,213,606 | −0.70% | 2.13 → 2.15 s | 311.6 → 311.6 MB | 82.3 → 82.3 MiB |
| L2 self-compile | 85,571,459,249 | 85,383,443,651 | −0.22% | 30.5 → 30.5 s | 4,162 → 4,162 MB | 988.0 → 988.0 MiB |

**CPU does not move measurably**: medians move ±3% between rounds here. On #8053's base, before
#8114 made `nodeTyAt` cheaper, the same gate measured −1.07% on plumb main.

Sweep, `b09064ce` against the candidate: 24,753 same, 0 bytes-only movers, 0 output movers.
`regress.vl`: no runs lost. Late demands: unchanged. Seed 6,845,160 → 6,846,112 bytes (+952,
+0.014%).

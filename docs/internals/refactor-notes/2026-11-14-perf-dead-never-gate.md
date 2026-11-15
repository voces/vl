# The dead-read walk runs only once a name can read `never`, 2026-11-14

Lane P, hit-list item 1 of `2026-11-14-perf-plumb-drift.md`. Base is master `3d526470`, a
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

`exprReadsDeadNever` asks the elaboration's `elabReadsMayBeNever`, which joins the two notes, and
returns false while it is false. Otherwise it walks as before.

**Phase-state surface.** The checker's note reaches emit through the elaboration, so
`wasmEmit.vl` imports no new checker symbol (surface 272). `emit_elab.vl` imports one,
`neverReadsSeen` (340 → 341, re-baselined in this PR). The fact is the checker's own decision:
whether it bound a name at `never`. The elaboration hands it on and does not re-derive it. The
emitter used to re-derive it at every expression, by walking the types the check had recorded.

**Exactness, checked directly.** A scratch compiler with the gate closed but the walk still asked,
failing with a marker wherever the walk would have answered true, was swept over all 24,734
programs. There were 0 markers. Without the gate the walk fires on 3 programs (two `tests/cases`
files and D3178's witness), and each sets one of the notes.

## Measurements

CPU is user+sys, the median of 10 warm runs over two interleaved rounds. Peak RSS comes from
`getrusage`, and peak live from `VL_GC_STATS=1`.

| unit | fuel before | fuel after | Δ | CPU (median of 10) | peak RSS | peak live |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| plumb main | 9,020,595,821 | 8,957,804,097 | −0.70% | 3.58 → 3.68 s | unchanged | unchanged |
| plumb tail | 6,535,300,321 | 6,489,591,849 | −0.70% | 2.21 → 2.25 s | unchanged | unchanged |
| L2 self-compile | 86,004,655,660 | 85,815,113,834 | −0.22% | 31.8 → 31.1 s | unchanged | unchanged |

Base is master `3d526470`; both seeds are fixpoints.

**CPU does not move measurably**: medians move ±3% between rounds here. On #8053's base, before
#8114 made `nodeTyAt` cheaper, the same gate measured −1.07% on plumb main.

Sweep, `3d526470` against the candidate: 24,795 same, 0 bytes-only movers, 0 output movers.
`regress.vl`: no runs lost. Late demands: unchanged. Seed 6,873,417 → 6,874,373 bytes (+956,
+0.014%). Compiler lines: +94, −1. Pin-helper budget (`emit_mono.vl`): unchanged.

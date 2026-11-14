# A union of contained records delivered into a record slot — 2026-11-14

Lane L, D16321 (clause 1), filed closing D4085.

## What moved

`narrowedArmNeedsUnbox` (wasmEmit.vl), the delivery boundary D1031 built for a value narrowed to
one struct arm, also answers a union whose every member is a record (`exprRecordArmsTy`). The
checker lets such a union reach a record slot only where each member fits it; each delivery site
already passes its slot's heap, so the box's payload is cast there, where every arm is stored at
that heap (`exprRecordArmsAt`). A first cut refused every other such delivery and moved D15719
from `runs` to an emit reject: a maker's or a value `if`'s literals built at the declared record
are a union by type and no box by rep, so they cast nothing.

## Evidence

- Matrix `union-of-contained-records-delivered-as-record` (`--before` master fixpoint): 28 of 46
  cells were check-clean invalid wasm, every annotated position and four un-annotated ones; all
  46 run. 0 runs → not-runs, 0 silent.
- Seed fixpoint; `gate.sh` passes.
- Net compiler lines +39; emit_mono.vl unchanged at 908.

# Type hash-cons stage 6b, tier 2: emit_elab.vl's reached walk limits, part 2 (lane HASH), 2026-11-16

Stacked on part 1 (s6b28). Seven more reached `walk-limit` hits in `emit_elab.vl`. Each walk now
ends by a visited set or a growing path, and a revisit keeps the answer the limit gave.

| census row | function | was | now |
| --- | --- | --- | --- |
| 423 | `elabValueInstRoot` | `steps < 16` down a member/index chain | the chain's own end |
| 424 | `elabFnIdsIn` | `depth > 16` | types seen (it only collects) |
| 385 | `elabHeldClosedTyAt` (+ `elabFreshMapSlotTy`, `elabHeldClosedTy`) | `depth > 8` | path of (type, first value) pairs; a revisit closes nothing (-1) |
| 350 | `elabReachHandsSet` (+ `elabReachParamHandsSet`) | `depth > 8` | path of (instance, parameter) pairs; a revisit hands no set (false) |
| 427 | `elabUnionArmBinds` | `depth > 16` | types seen (it only collects) |
| 339 | `elabCanonStr` | `ELAB_CANON_DEPTH` 16 | path of types; a revisit spells as `tyToStructStr` did at the limit |
| 381 | `elabLeafParamIx` | `depth` 4 | bindings seen |

`elabHeldClosedTyAt` keys on the value as well as the type. A recursive type legitimately recurs over
a nested literal tree, so the type alone would refuse a two-level tree. `elabReachHandsSet` is an
all-calls test, so it keeps a path rather than a global set: one branch's answer cannot stand for
another's.

## Grading (fixpoint seeds, part 1 vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- Self-compile fuel: +0.7% on the baseline.
- `walk-limit` baseline: 538 (`emit_elab.vl` 68 → 61).

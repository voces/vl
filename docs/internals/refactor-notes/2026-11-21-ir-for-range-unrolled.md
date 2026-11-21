# IR: a fully unrolled range loop (2026-11-21, lane IR-D1)

Stacked on #9381 (rolled range loops), as the coordinator ruled: the unrolled arm shares legacy's
unroll decision as a plan rather than re-deriving it.

## The change

`forRangeArm`'s "unrolled" arm, the one decision legacy's `emitForRangeStmt` dispatches on, now
builds in the IR from `forRangeUnrollPlan`, the values legacy's `emitRangeUnrolled` call takes:
the first value, the step and the trip count, with a getter's constant range included. It uses
§1.2's existing nodes again: an `SBlock` (break) of copies. Each copy is:
- an `SAssign` of the copy's constant into the loop var, as legacy's `i32.const; local.set`;
- the body, built once per copy, where a read of the loop var is that copy's immediate. This
  mirrors legacy's `emitIdentLocalRead` under `urSlot`/`urVal` (`ibRangeImm`);
- an inner `SBlock` around the body when a `continue` lands at the copy's end
  (`blockHasContinueFor`).

The tree-only gates of #9381 (`forRangeRolledBlock`: dynamic step, hoist, proof, wrap) apply to
both arms. For an unrolled loop the wrap gate is merely conservative.

## Measured vs #9381's head a0d38791 (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,285 → 19,285 | 138 → 138 |
| distilled | 43,805 → 43,805 | 7,940 → 7,940 |
| tests/cases | 59,191 → 59,221 | 4,250 → 4,263 |
| capability probes | 481 → 481 | 138 → 138 |
| filed witnesses | 17,038 → 17,041 | 3,181 → 3,181 |

`for range unrolled` falls from 85 to 0 first misses. What those loops miss next is now named:
`hoisted` 6 → 17, and `for range slot` 3, a loop var whose slot another variable already holds.
`claim fell back` is the same 3 rows as on the base.

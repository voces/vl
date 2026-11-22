# IR coverage: the atomics and the scalar saturating truncations (2026-11-21, lane IR-N7)

On master 41144724, `tests/cases` has 548 functions with `intrinsic none`. Most are the
memory-management intrinsics (#9378) and the SIMD loads and stores (#9397). I instrumented a copy
so the miss names its callee, and ran it on master d1b78413 with both branches merged. That leaves
21 rows over 18 files, in two families:
- the atomics (`__atomic_load*`, `store*`, `rmw*`, `rmw*_cmpxchg`, `wait*`, `notify`, `fence`),
  mostly `tests/cases/atomics/*`;
- the eight scalar saturating truncations, `__trunc_sat_f{32,64}_{s,u}_i{32,64}__`.

## Design

- **Each family shares one plan and one tail with legacy** (`wasmEmit.vl`):
  - Atomics: `atomicCallNamed` (the spelling, with no binding owning the name), `atomicPlanOf` (the
    row, the memory operand count `apBase`, 0 for a fence, and legacy's refusals verbatim),
    `atomicValPrim`, `atomicResultPrim` and `atomicTail`.
  - Truncations: `truncSatCallNamed`, `truncSatPlanOf` (sub-opcode, float and integer prims) and
    `truncSatTail`.
  - Legacy's two arms are rewritten over them. The plans read the checker's table in `wasmEmit.vl`,
    so the IR modules import no checker symbol (phase state unchanged).
- **`RAtomic { amArgs, amAt }`.** The builder takes the address along `memAddrPlanOf`'s `const` or
  `rest` arm, as `RMemAccess` does, then each value operand already at `atomicValPrim`. A fence
  has none. The verifier holds the address at i32, each value at its row's prim, and the result at
  `atomicResultPrim` (no value for a store or a fence). In a statement, a valued atomic is dropped,
  as `emitCallStmtIdent` drops it.
- **`RTruncSat { tsV, tsAt }`.** The float operand is already at the plan's prim, then the
  instruction. A discarded one is dropped.
- Both are family `other`, so claiming does not widen.

## Left as named misses

- `memory address` `lma`/`fold`/`wide`/`bad`, `atomic operand coercion` and
  `trunc_sat operand coercion`: an operand legacy would widen.

## Measured

Against master's seed: on the 17 files with an atomic or a truncation, covered = matched goes
from 24 to 38 functions, and start functions from 6 to 12. What is still uncovered there is
#9378's and #9397's. The row `tests/ir-shadow-rows/atomic-trunc-sat.vl` has 12 functions. All 12
are `intrinsic none` on master's seed; here all 12 are covered and matched. The full table is in
the PR body.

## Fuel

L2 self-compile fuel rises 452.1M, +0.42% on 108,270,449,226 at base 755a6b9f, measured on
fixpoint trees with a commit split. All of it is the compile of this PR's own source, not
slower code: the head's seed compiles the base tree at exactly the base's fuel. By phase, head
on head against base on base:
- `checkProgram` +0.24G;
- the code payload +0.13G;
- the emit passes and `emitModule` +0.06G.

The new lines check at about 7x the average line. The split points at the two `Rhs` members:
- the IR files carry +444M (legacy alone +8M), the builder's +204M and the node set's +240M;
- that +240M is paid with no `RAtomic` built in the self-compile;
- moving the new arms last saves only 24M; the two `callRhs` probes are 43M.

So the cost is each `match` over `Rhs` checked against two more members. That is a general cost
of widening `Rhs`, reported to the coordinator.

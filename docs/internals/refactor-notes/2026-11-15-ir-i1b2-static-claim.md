# IR step I1b-2: the static claim, 2026-11-15

Lane I. This is the second half of step I1b in `ir-design-2026-11.md` §5.3, in the static form the review set
(§10). The claim decision is made before legacy runs, from the function's IR alone. The dual emit
is the gate's check that the decision is right, and never decides anything per build. `CLAIMED` is empty, so no function is claimed
and no byte moves. C1 adds the first family. Measured on fixpoint seeds.

## What landed

- **Explicit global context.** `GlobalCtx { gcInStart, gcFnPos, gcGuardOff }` is now an argument of
  `userGlobalReadClass`, `userGlobalWriteClass` and `initGuardNeeded`.
  - Legacy builds it from emit state at its two chokepoints (`globalCtxNow`).
  - The builder builds it for the lowering. `gcInStart` is false, and a `fail` row fires if the start body ever reaches the shadow.
  - `gcGuardOff` comes from `ASSIGN_AS_VALUE`, the builder constant that also gates the `=`-as-value miss.
- **Families** (`IrFamily` in `ir.vl`): `scalar`, `control`, `call`, `global`, `list`, `other`.
  - `irNodeFamily` and `irRhsFamily` are `_`-less matches over `IrNode` and `Rhs`.
  - A slotted variable of a reference rep is the `list` family's. The list lowering reads its slot
    off legacy's frame layout, which a claim runs before.
- **The claim** (`irClaimFn`, called from `emitFuncCode` after `paramValtypeFloor` and `buildLocals`, before the
  scratch layout and `emitFuncBody`). A function is claimed when the builder covers it and every node (and every slotted
  variable) is in a family in `CLAIMED`. The lowering then writes the code entry onto `out`, banks the
  statement rows at `fnPos`, and keeps its callees for dead-function elimination. Legacy's body lowering does not
  run. Its frame setup before that point still does, because the lowering reads `vSlot` from it.
- **Indices** a claimed lowering names must already exist: a callee inside `fnStmts`, a global with an
  assigned cell, and the `__f64_rem__` helper. A lowering that misses falls back to legacy for that build and counts
  `claim fell back: <why>`. Armed, a claimable function whose dual emit does not match counts
  `fail a claimable function did not match`, which reds the gate's `ir shadow` row.
- **Nothing claimed builds nothing.** With `CLAIMED` empty, `irClaimFn` returns at once.
- **Mode 3** (`irShadowArm(3)`, `$VL_IR_SHADOW=3` with the one host line) claims `scalar`,
  `control`, `call` and `global` without arming the shadow, which tests the claim path itself.
- **The gate** runs `scripts/silent-sweep/distilled/ir-shadow.vl` as a blocking row (`ir shadow`). It takes
  about 14 s and peaks at 1.1 GiB.

## Measurements

| reading | value |
|---|---|
| claim compiler vs the previous one, compiling the same source | byte-identical (`CLAIMED` empty) |
| mode 3 over the distilled corpus (12,168 cells): output identical to unclaimed | 8,889 of 8,889 cells that build: identical; 3,279 fail to build either way; 0 differ in exit code |
| functions mode 3 claimed over the corpus | 9,482 |
| claims that fell back in mode 3 | 0 |
| L2 self-compile guest fuel, previous compiler then this one | 89,563,983,548 to 89,564,283,988 (+0.0003%) |
| the predicate's cost when it builds every function with nothing claimed | +0.29% (89,558,760,887 to 89,822,357,756), under the review's +0.5% pre-filter bar |
| `ir-shadow.vl` | 12,259 of 12,259 covered functions matched |

Before short-circuiting, the predicate built the IR for every function with nothing claimed. Mode 3 with
`list` included fell back in 399 cells, every sampled one on the list lowering's frame reads (`locals
layout`, `list read wrapper slot`). Those reads are why `list` waits for its own slice, which must
take its slots from the IR's own frame rather than legacy's.

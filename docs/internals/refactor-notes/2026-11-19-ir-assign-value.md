# IR: assignment as a value (2026-11-19)

After `map read inline`, the self-compile's largest single blocker was `assignment as a value`:
208 functions alone. A probe naming the functions showed it is nearly all the setter idiom
`export function xSet(v: T) { return x = v }` (`literalsReset`, `cexAtF32`, the `*Set` and
`*Reset` exports). The builder refused every `=` in value position (`ASSIGN_AS_VALUE`).

## One decision
- **`asgValueArmOf`** (wasmEmit) names every way legacy yields an assignment's value, in its
  order: `lit`, `nullLit`, `reRead`, `parked`, `nonNullRead`, `nonNullPark`, `boxedArm`,
  `widerRow`, `none`. Legacy's `emitAsgValueOf` is a `_`-less match on it, so the ladder that was
  a run of `if`s is one exhaustive dispatch, with its bytes unchanged.
- **The IR** builds the `reRead` arm with no unwidening (`asgReadUnwidenOp` -1) on a name target:
  the assignment's store (`assignTo`, the statement's own builder), then the target's read under
  `asgReReadEnter`, as `emitAsgValue` re-reads it. Every other arm is a named miss
  (`assignment value <arm>`).
- **The guard.** Legacy re-reads with the init guard off. The builder reads in its own context and
  misses on a guarded global, and a read whose class is not `guard` there has the same class with
  the guard off, so the lowering's context stays `gcGuardOff: false`. `ASSIGN_AS_VALUE` is gone.

## Measured on fixpoint seeds: master `8b89f4bc3` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 14,671 | 14,875 |
| self-compile `assignment as a value`, alone | 208 | 0 |
| distilled functions claimed (`--claims`), all matched armed | 35,249 | 35,250 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,514 identical, 0 differ.
- **Mode 3:** the cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 100,748,046,568 → 100,763,711,338 (+0.016%).
- **Lines:** +140 / −95 in `compiler/`. A coverage step: 204 self-compile functions, 1 distilled.

## What is left
- `assignment value lit` (5 self-compile): `return x = 0`, the literal built at its width after
  the store.
- An element or field target's re-read, and the unwidening arms: none appear alone in the
  self-compile.

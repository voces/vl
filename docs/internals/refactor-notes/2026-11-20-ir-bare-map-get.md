# IR: a bare map read `m[k]` (2026-11-20)

`blockers index none` named 29 self-compile functions alone and 51 in all: every one a bare read
`m[k]` with no `??`, which the builder sent to the list reader. 25 of the 29 read a map global.

## The change
- **One shared arm.** `mapGetArmOf(idxIx, fnIx)` (wasmEmit) answers union box, helper or inline.
  Legacy's Index arm now dispatches on it with a `_`-less `match`, and the IR asks the same question.
- **`RMapGet = { mtSym, mtNonNull, mtLoc, mtKey, mtAt }`.** Its receiver encoding is the one
  `RMapHas` and `RMapGetOr` use: a map global read plainly, or a local receiver operand.
  `MapOp` loses its unbuilt `get` member; no second route reads the same thing.
- **One receiver-and-key builder.** `mapRecvKeyOf` builds the receiver, then the key. It refuses a
  key that reassigns the receiver and decides the global's recovery. `mapHasRhs`, `mapGetOr` and
  the new `mapGetBare` all call it. A `has` key's own miss now names its own reason, not `method
  operand`; only census labels move.
- **Lowering.** The helper arm calls `__map_get_<row>__` with `mapGetMissOf`'s miss. The inline arm
  runs IR2's `mapProbeHead` (#9260), then `emitMapGetTail`. Then comes the narrowed read's tail.
  The read's `vl-src` element row is banked as `emitIndexBanked` banks it. The lowering asks
  `mapGetArmOf` and `userGlobalReadClass` again, and misses on any disagreement.
- **Verifier.** An `RMap` receiver, and a result at the value's rep or at that rep's nullable.
- **Builder reps.**
  - An mv slot's ref value at its disc-1 niche, or as itself when the read is narrowed.
  - A mono-valued map's value as itself.
  - A `boolean` map at `boolean | null`: its miss reads `2`, the nullable's sentinel.
  - Union and scalar (`f64`/`i64`/`f32`/`v128`) mv slots stay named misses.

## What is left
Of the 29 functions blocked by `index none` alone, 25 are now built by the IR. The self-compile's
remaining bare-read blocker is `map get rep` in 2 functions. Both are mv slots whose list value's
nullable inner rep is not the stored value rep, so the read would owe a conversion legacy does not
write. The other 2 of the 29 now stop at a blocker that is not a map read (`for in map receiver`
rose 19 → 20).

## Measured on fixpoint seeds: merge-base `ea0a93deb` (#9267) against this branch

| | merge-base | this branch |
|---|---|---|
| self-compile `blockers index none` (alone / in all) | 29 / 51 | 0 / 0 |
| self-compile `blockers map get rep` | 0 | 2 |
| self-compile functions claimed | 18,449 | 18,474 |
| distilled functions claimed (`--claims`) | 41,229 | 41,230 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,528 identical, 0 differ.
- **`tests/cases` A/B, master seed against this seed, no shadow:** 7,248 identical, 0 differ. This
  covers legacy's Index arm, which now dispatches on `mapGetArmOf`.
- **Mode 3:** 0 differ, and the self-compile identical.
- **L2 fuel**, same box: 103,444,647,603 → 103,569,052,095 (+0.12%).

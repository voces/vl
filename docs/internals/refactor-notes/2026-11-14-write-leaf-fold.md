# One write-leaf walk: maps folded into the place paths, the store checks onto the producer, 2026-11-14

Lane M, task (1) of lane S's slot-store plan. It is independent of stage 2 and touches only
check_elab_cap.vl and check_fn_tag.vl. Net compiler lines: +95 / −171 (−76).

## Change

- **The map twin is gone.** `fnTagMapWriteLeavesOf`, `fnWriteOnlyIntoMap`, `fnMapArgOnlyOf` and
  `fnWidenedSameSet` are deleted. `fnTagWriteLeavesOf(d, s, held, out, with)` walks one list of
  containers: the widened lists, the widened record fields, and the held maps (`ftHeldCur`) whose
  values carry `s`, each at its place path. `fnWriteOnlyInto(v, s, path)` takes `push` and `set`
  alike as a store at the element. `fnArgOnlyFrom(d, s)` asks one question,
  `fnHoldsSet(d, s)`: is `d` a container of `s`?
- **One rule for when the leaves are taken.** `ftPlan` takes every recorded write as a leaf,
  typed as the container's slot. Before, the map's write leaves were always taken, but a list's
  only for a member with no other leaf. That difference was D16231 (clause 1): a member written
  directly into one list and through a parameter into another stored a closure into a list of ids.
- **The store context asks the producer.** `ftWiderWriteLeaf` becomes `ftWriteLeafOf`, which also
  answers whether the producer takes the write for `s` itself. `ftStoreInWider` is deleted; its
  question is `ftHeldWider` on the store's own type, already asked one line above.
  `ftSlotWriteArg` (`m.set` / `push` arguments) drops its `ftParamHolderHolds` disjunct for
  `ftWriteLeafOf`.
- **Kept.** `ftParamHolderHolds` stays in the index-store arm and in `ftRecIntoMap`. Dropping it
  from the index store regressed
  `closures/generic-written-into-map-through-param-called-at-two-types.vl`: there a map handed both
  a generic and a function argument is a holder by type before any widening records it. Its
  remaining job, a holder decided by the argument's type rather than by a recorded widening, is
  stage 2's place fact.

A further bug fix: `fnWriteValueSetOf` (#8039) read a top-level statement (parent `Program`) as a
read value. Once the producer was asked for every member, that made two map fixtures refuse.

## Grading

- Fixpoint seeds on both sides, `--before` master `f302cddec`, which this merges.
- Every `@run` fixture under `tests/cases/closures`, `tests/cases/maps` and `tests/cases/*/*fn*`
  (2,782 programs) gives the same first lines as the step before. `scripts/gate.sh` passes on the
  merged tree except `vl_seed_sidecar_dir_test.ts`, which tests #8047's host change against a
  shared `vl` binary built before it; this PR touches no host code.
- 26 grids, with 0 runs→not-runs and 0 silent on each, and the same counts as master:
  - the 16 G3 / write-result / family grids of #8030 and #8039;
  - `fn-map-written-two-results` (15) and its `-generic` (16);
  - the design note's core set: `fn-list-alias` 46, `fn-value-generic-list-index-written-open` 45
    (its trap cell is D16280 on both seeds), `-pushed-same-operand-calls-at-two-types-open` 18,
    `map-value-nested-record-of-hole-fn-uncalled` 62, `hole-fn-list-loop-const-open` 25,
    `hole-fn-list-returned-at-two-instances` 17, `fn-value-generic-spread-copy-written` 46,
    `captured-alias-of-hole-fn-map` 42, `fn-value-generic-map-stored-field-read-handed-open` 18,
    `generic-returned-by-maker-through-hole-param` 32.

# The D4949 store-back is unreachable and goes — 2026-11-15

Lane L, the coordinator's item: measure whether D4949's store-back is reached after the D16047
refinement, and delete it if nothing reaches it.

## Measured

A probe seed with an `emitFail` on the one assignment of `LIST_ARM_EMPTY` (the arm class the
store-back serves), against a control that must trigger it:

- `(i32 | string)[] | i32[]` tested `is i32[]` over an empty first arm: **reaches it**; so does
  `(i32 | null)[]`, and a record list tested at a contained record's list (`S[]` at `R[]`).
- The distilled corpus: **no cell reaches it** (`regress.vl`, no runs lost on the probe seed).
- The case suites: **six fixtures reach it**, every one with a non-empty list, so the arm's answer
  (`true` only when empty) was never observed: with the arm answering "never fits" all 7820 pass.

## What moved

- An arm of another tag never fits a list test, empty or not: its element type is fixed apart
  from the test's, which the D16047 refinement asks for. The three controls move `true` to
  `false`, the ruled answer.
- `emitListIsRebox`, the store-back kinds and `listIsStoreBackOf`, `listArmWrapOfTy` and the
  `LIST_ARM_EMPTY` class are deleted (wasmEmit.vl, 157 lines out, 9 in).

## Evidence

- Matrix `annotated-empty-wider-list-delivered-into-union-is` (`--before` the master fixpoint):
  0 of 64 ran, 34 run; 0 runs → not-runs, 0 silent. Its other cells are the un-annotated face's
  `is i32[]` over a bare `(i32 | string)[]`, an emit refusal on both seeds.
- `check-filed-witnesses --strict` 5102 of 5102 as filed; the case suites 7820 of 7820.

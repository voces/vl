# An empty collection of a fixed element type tests by its arm, the D16047 refinement — 2026-11-15

Lane L, the owner's two 2026-11-15 rulings refining D16047.

## What moved

- **The predicate.** `tyTestMemberFit` (check_relate_core.vl) answers a list partly only where its
  element may fit (`listElemNeverFits`), so `i32[]` and `f64[]` never fit each other.
- **The list test over a union.** `emitListIsAcrossReps` (wasmEmit.vl) drops an arm with another
  tag that shares no value with the test (`tyFitKind`), so an empty `i32[]` arm no longer fits
  `is f64[]` by its emptiness. An arm that may share a value keeps the emptiness test.
- **Maps and sets** already answered by the arm, and an empty literal delivered into a union
  already took the first arm it fits; only the list test read emptiness.

## Cells that move, true to false (intended)

- Rows re-graded to the new answers: D4915, D4939, D4949, D4953, D4954, D15711.
- Fixtures re-pinned: `unions/empty-list-is-disjoint-list-arm`, `-narrowed-read`,
  `-nullable-operand`, `-store-back`, `soundness/narrowed-arm-list-field-narrowed-again-reads`.
- Matrices `--before` the master fixpoint: `annotated-empty-list-delivered-into-union-is` 0 of
  64 ran, 34 run; `empty-list-literal-delivered-into-union-is` 0 ran, 34 run (its un-annotated
  face is the open `[]`, vacuous by D16047). The map and set twins run as before. 0 runs →
  not-runs. None of these is a `runs → not-runs`, so `scripts/sweep-owed.txt` takes no entry.

## Residue

- D16342: a hole or generic parameter pinned at an empty `i32[]` still answers `is f64[]` by
  emptiness (`emitListEmptyFitIs`, D4910), which cannot tell a pinned binding from a defaulted one.
- D16340, D16341: two open-collection invalid modules the matrices found, on master already.
- The D4949 store-back is now reached only by a list whose arm may share a value with the test.

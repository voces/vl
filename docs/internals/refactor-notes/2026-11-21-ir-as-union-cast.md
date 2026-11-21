# IR: a union-box `as` by legacy's tag test, and a niche's `as?`/`as!`, 2026-11-21

`asCastArmOf`'s `union` arm was the largest `expression as` sub-shape: 80 of 183 tests/cases
functions, 72 of them with no other blocker. The IR's `numCast` refused every arm without a
numeric kind, so a member cast out of a boxed union missed as `expression as`.

## The change

- **Legacy split.** `emitAsUnionCast`'s tag path is split, with its code moved and not rewritten:
  - `asUnionTagPlanOf` is the target arms' tags and how the tail unboxes;
  - `emitAsUnionTagTail` is the box stash, the tag chain and legacy's own `emitAsUnionTail`, ending
    in `emitUnionUnboxTail` or the variant or heap `ref.cast`.
  - Legacy calls them in its old order, so there is one decision.
- **Shared predicates.** `asListAcrossRepsOf` and `asOneListOf` are the shape tests of
  `emitAsListAcrossReps` and `emitAsOneListCast`, which now call them.
- **`asUnionTagWhy(exprIx, fnIx)`.** It names the lowerings other than the tag test, each by legacy's
  own predicate: a niche operand (`exprUnion`), a map twin (`mapSoftTwinClashOf`), a literal-union
  target (`asExprBoxToLitUnion`), and a list target tested across reps (`asListAcrossRepsOf`).
- **`RAsUnion { auV, auAt }`.** The IR builds the box operand, and the lowering writes `irLOpnd(auV)`,
  then `emitAsUnionTagged`. That is the legacy writer, which becomes an IR lowering helper at I8.
  `as?`'s value comes out of a valued `if`, so no temp built before it may wait on the stack.
- **Niche operands (`asNicheCastWhy`).**
  - `as?` is the operand at its own rep.
  - `as!` is the designed `RCast` trap: `ref.as_non_null` over a nullable reference or string.
  - A union of lists stored as one list, and the propagating `as`, stay named misses. The latter's
    operand is written inside the block it leaves.

No second unbox is written: the tail is legacy's, and IR-N4's `RBoxNarrow` atom arm ends in the
same `emitUnionUnboxTail`. The coordinator ruled the split acceptable.

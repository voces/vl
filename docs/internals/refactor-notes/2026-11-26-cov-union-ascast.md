# IR coverage: `as?` after an operand (lane COV-UNION, 2026-11-26)

## The refusal

`asUnion` refused `x as? T` (`asMode` "null") whenever the block already ended in a temp
(`union cast after an operand`), with the comment that the cast's valued `if` "takes its value from
the stack, so no temp an operand before it built may wait there". The witness is
`context-typed-nullable-variant-param`'s `mem.g(sh as? Circle)`, where the closure field `mem.g` is
the waiting temp.

The lowering does not need the guard. A temp is written at its one use (`irLOpnd`,
`tempRhsWrite`), and `RAsUnion` is a temp like any other. Its tail, legacy's `emitAsUnionTagged`,
stashes the box in a local, tests the tag and opens a valued `if`. A value an earlier operand left
on the wasm stack sits beneath that `if` legally, and the statement-order check (`irLSettle`)
still sees the temps consumed in definition order. The guard is removed. This is not the
staged-operand family of a statement between a temp's definition and its use (the coordinator's
predicate question, answered separately): `as?` writes no statement.

## Measured

Every `as?` program in tests/cases and the distilled corpus (107):
- Claimless identity (`ir-identity.sh --claimless` over the list): identical 78, fail under both
  27, differ 0; 2 byte differs, behaviourally equal.
- Claims census (`VL_IR_SHADOW=5`), master before and this tree after: start bodies 86 → 87 of 89,
  programs fully claimed 74 → 75. `union cast after an operand` 1 → 0. No claim falls back.

Q58 sweep: `tests/cases/unions/as-null-cast-after-an-operand-in-each-position.vl` (a closure
field's argument, a second argument, a binary operand, a record literal's later field, a list
literal's later element). Its output equals master's. Master reports `union cast after an operand`
on it; this tree reports blockers none, and the claim takes it.

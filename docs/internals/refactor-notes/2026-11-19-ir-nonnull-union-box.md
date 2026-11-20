# A value boxed into a non-null value union (2026-11-19)

The call-site census (family A) named the boxing of a value into a non-null union box, at an
argument or a return, as the largest corpus miss of the family: `argument coercion: i32 to box`
(144 functions where it is the only blocker), `return coercion: list to box` (101), and the other
scalar rows. The IR built only the boxed `T | null` (`boxedNullable`); the shared box plan
`holeBoxPlanOf` (#9122) declined any other union.

## Shape
- `holeBoxPlanOf` admits a non-null value union's box (`RBox`) beside the boxed `T | null`: both
  are the one `{tag, payload}` box, so the plan's `atom`, `lit` and `pass` arms write the same
  bytes. A list or a record into a box is still the ladder (`emitUnionCoerce`'s list and record
  rungs), so `return coercion: list to box` is not taken here.
- The builder's `widenTo` boxes into any box the checker records at the node (`heldAsBox`), so an
  argument (`deliver`, #9184), a return and a declaration take it.
- A returned call in a `pass` box writes nothing around the call, so the return lowering takes it
  in its tail form, as it does a call in an `RRetag` (`passBoxOf`).
- A call whose template hole the instance pins to a string or atom (`tplStrHoleOf`) is written by
  legacy without the call, so the builder misses it (`template hole pinned`).

## Measured
See the PR body.

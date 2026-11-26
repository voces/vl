# START-2: `operand at null` (2026-11-26)

Regen-10 lists 3 units, all `==`/`!=` between two `null`-typed sides where one side assigns `null`:
`soundness/null-pair-compare-assignment-side.vl` (`f`, `@start`) and D17423's witness.

Legacy picks the null-pair constant by `nulNoneEqRoute`: `nulNoneEqSides`, or a side that assigns
`null` (`asgYieldsNullLit`). The builder asked only `nulNoneEqSides`, so the compare fell through
to the numeric operator and refused the `null` operand. Both builder sites now ask the route.

`nulTest` takes the route only where `eqRouteOf` says `nulNone`. Legacy asks other routes first: a
null-name test claims `(r = null) == null` (`unions/deep-is-arm-write-in-expression.vl`'s `before`).

Where the right side assigns `null`, legacy drops the left's value before that store. So
`nulNonePairEq` drops the left in place there and otherwise defers both drops past the sides, as
it did. Deferring a left call past the right's store would leave the value equal but the bytes not.

`ir-parity`: byte-identical on both programs. The case already holds each position: an assignment
on the left or the right, both sides assigning, a `null`-typed binding, a global, and a side whose
call reads the stored name.

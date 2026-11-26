# START-2: `operand at null` (2026-11-26)

Regen-10 lists 3 units, all `==`/`!=` between two `null`-typed sides where one side assigns `null`:
`soundness/null-pair-compare-assignment-side.vl` (`f`, `@start`) and D17423's witness.

Legacy picks the null-pair constant by `nulNoneEqRoute`: `nulNoneEqSides`, or a side that assigns
`null` (`asgYieldsNullLit`). The builder asked only `nulNoneEqSides`, so the compare fell through
to the numeric operator and refused the `null` operand. Both builder sites now ask the route.

On the assignment route, legacy drops each side's value where it is built. Sinking the left value
past the right side would leave the value equal but the bytes not. So `nulNonePairEq` drops in
place on that route and keeps its sink for a plain `null` pair.

`ir-parity`: byte-identical on both programs. The case already holds each position: an assignment
on the left or the right, both sides assigning, a `null`-typed binding, a global, and a side whose
call reads the stored name.

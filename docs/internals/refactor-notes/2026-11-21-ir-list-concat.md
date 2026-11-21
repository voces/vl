# IR: list `+` (2026-11-21, lane IR-N2)

A list concat reached the builder's binary-operator path with non-scalar operands and missed at
`operand type`. The self-compile's `filledI32` (`a = a + a`) and `rpJoin` (`parts[j] +
parts[j + 1]` over `u8[]`) stopped there. Legacy writes a concat in one of two writers.
`emitListConcatI` stages an i32 list in the LEQI frame. `emitListConcatG` stages every other rep
in that rep's LCAT frame. Both evaluate each operand, recover a narrowed nullable one, then run
the same thirty-instruction tail over their frame.

## The change

- **Legacy, bytes unchanged.** The two tails are one `listCatWrite(bA, wrap, back)`. The two
  writers' operand recoveries are one `listCatOperandTail`. The writers end in one
  `listCatTail`, which picks the frame. The dispatch asks one route, `listCatRouteOf`:
  `none`, `refused` (operands that resolve to no one list rep, or an element kind with no
  concat), `plain`, or `widen` (an operand copied into the concat's rep first,
  `catWidenSideOfBin`).
- **IR.** `RListCat { ljL, ljR, ljAt }`. The builder (`listCat`) builds both operands at the
  concat's list rep and misses at `list concat widen` or `list concat refused`. The lowering
  writes each operand and its `listCatOperandTail`, then `listCatTail`, in legacy's order. The
  verifier requires both operands at the result's list rep. `ir_build` reaches the route through
  `irListCatHook`, as it reaches `listEqRouteOf`.

## Witness

`tests/cases/lists/concat-each-list-rep.vl` concatenates i32, string, f64, record and packed
byte lists, a chain, a narrowed nullable operand, a widening concat and a doubling loop. Under the
merge-base seed all nine functions stop at `operand type`. After, eight are covered and matched,
and the widening one is `list concat widen`. Shadow row `LIST_CAT`.

## Measured

See the PR body (fixpoint seeds on both sides, merge-base `f44a504b8`).

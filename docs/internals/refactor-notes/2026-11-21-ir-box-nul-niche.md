# IR: a nullable ref boxed into a union that admits null (2026-11-21, lane IR-N2)

The second rung of the `box ladder` split (atom 39, nullable 33, list 33, record 13, i32 13,
v128 9, other 9 sole-blocker functions over the corpus files). The atom rung is #9405.

`emitUnionBoxNulNiche` boxes a `V | null` ref niche (`coalesceNulRefNicheOperand`) into a union
whose set holds `null`:
- It reads the value once, raw, and tees it into the niche stash slot.
- Its `ref.is_null` picks the null box or the value under its arm's tag (`coalNicheBoxTag`).
- A `boolean | null` niche tests its value instead, and stays the ladder's.

## The change

- `holeBoxPlanOf` returns `nulNiche` (its `hbKind` the union) for that shape, at the ladder
  position where legacy reaches the rung.
- The tag lives in the emitter (`nulNicheBoxTagOf`). Where it is -1, legacy's `emitUnionBoxArg`
  takes the ladder, whose rung returns 0 and falls to the record rungs as before. The IR misses
  it by name.
- `holeBoxHead` takes the stash slot ahead of the value, as the rung did. `holeBoxTail` is
  `nulNicheBoxTail`, the rung's own instructions. The rung now writes through `emitHoleBox`.
- The IR's `boxPlanWhy` takes a nullable ref or `string | null` operand, and `boxOp` writes the
  head, the operand and the tail.

tests/cases matched 63340 → 63354 (+14) on one A/B over seeds of 94356c86, no new fail rows.

Row file `tests/ir-shadow-rows/nullable-ref-boxed-niche.vl`; witness
`tests/cases/unions/nullable-ref-boxed-keeps-its-null.vl`.

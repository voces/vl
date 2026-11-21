# IR: a literal-union atom boxed as its member string (2026-11-21, lane IR-N2)

The `box ladder` census split by the boxed value's rep (sole-blocker functions over the corpus
files, one-off instrumented build): atom 39, nullable 33, list 33, record 13, i32 13, v128 9,
other 9. This note takes the atom rung.

`emitUnionCoerceUnder`'s atom rung boxes a literal-union value whose union takes it as a string
(`coerceTakesAtomAsStr`). A `K | null` takes `atomNulStrTail`, the plan's `atomStr`. A `K` takes
the string tag, `emitAtomToStr` and the box. The plan returned the ladder for the second.

## The change

- `holeBoxPlanOf` returns `atomAsStr` (kind 2) for a `K` atom where the union takes it as a
  string.
- Legacy's writer is `emitHoleBox`: `holeBoxHead` writes the string tag, the value is
  `emitAtomToStr`, and `holeBoxTail` writes the box. The ladder rung calls the same writer, so
  one writer remains.
- The IR's `boxPlanWhy` takes an atom operand. `boxOp` writes the head, the atom, `atomStrTail`
  of the atom's plan (the decode the IR's `RAtomStr` writes) and the tail.

tests/cases matched 63085 → 63119 (+34) on one A/B over seeds of fbad6724, no new fail rows.

Row file `tests/ir-shadow-rows/atom-boxed-as-its-string.vl`; witness
`tests/cases/unions/literal-union-atom-boxed-as-its-string.vl`.

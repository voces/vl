# IR: a list literal boxed at its checked ref-list arm (2026-11-22, lane IR-N2)

`box ladder`, the list rung, after #9486's atom lists. The largest remaining group in that
census is a list literal boxed into a recursive union: `f64[] INTO Json`, 25 functions, plus the
string and integer lists beside it. `viaArg([[2.5]])` and `leaf([2.5])` both pass a literal where
`Json` is expected.

Legacy reaches `emitUnionCoerceList`'s checked-type rung. The checker types the literal at the
union's own list arm (`Json[]`), so `arrLitRefSlotAtTy` names a ref-list slot the union carries.
Legacy writes that arm's tag (`refArrBoxTagOf`), the literal as itself (`emitExpr`, its elements
boxed), then `struct.new` of the box. `holeBoxPlanOf` returned the ladder.

## The change

- `holeBoxPlanOf` (`emit_plan_union.vl`) gives such a literal the `refList` arm at that tag
  (`arrLitArmSlotOf`), at legacy's position in the list rungs: after the ref-element list and
  closure rungs, before the value atoms. `emitHoleBox`'s `refList` arm is `emitExpr`, so legacy
  writes the same bytes; ir-identity `--names` and `--cases` compare them. The IR already builds
  the literal at its checked type and takes the arm as a list.
- `emitUnionListLitViaRefArm`'s later rung (a literal built through an arm its own type names no
  slot of) had no hit over these files and is left on the ladder.

Covered = matched over the files the ladder census named: 582 → 608.

Row file `tests/ir-shadow-rows/list-literal-checked-arm-boxed.vl`; witness
`tests/cases/unions/list-literal-boxed-at-its-checked-arm.vl`.

## Also: the atom-list tag condition named once

#9486's review noted that the plan restated `emitUnionCoerceAtomBox`'s atom-list tag condition.
`atomListTagsAt` (`emit_plan_union.vl`) now holds it, and both ask it.

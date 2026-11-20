# A list literal boxed into a union's value-atom arm (2026-11-20)

After #9218 the largest corpus `box ladder` row was list literals (`L8 nonprim arraylit`): the
box plan's scalar-list branch took a list-typed value but not a literal, since
`emitUnionCoerceList` gives literals rungs of their own ahead of the value-atom box.

## Shape
- A literal reaches `emitUnionCoerceAtomBox` (tag, the literal as built, `struct.new`, the plan's
  `atom` arm) unless one of those rungs takes it: the empty literal, its own ref-list arm
  (`arrLitRefSlotAtTy`), a map or nested-list first element, or an arm it is built through
  (`emitUnionListLitViaRefArm`). `listLitTakesAtomBox` is their conjunction, declining a map or
  nested element outright rather than asking which arm takes it.
- The arm choice of `emitUnionListLitViaRefArm` is now `listLitRefArmSlotOf`, read by both; its
  first-element atom is `listLitElemAtomOf`. `arrLitRefSlotAtTy` moved from `wasmEmit.vl` to
  `emit_plan_union.vl` beside it.
- Legacy's `emitUnionBoxArg` reads the plan first, so these literals move onto `emitHoleBox`; the
  corpus measures that path byte-identical.

## Measured
See the PR body.

# IR: a closure under its closure arm's tag (2026-11-21, lane IR-N2)

The largest remaining `box ladder` rung after the numeric union and the map is a closure: 63
functions alone over the distilled corpus and `tests/cases`. Legacy boxes a closure in
`emitUnionCoerceList`, ahead of the value-atom gate. It writes the closure arm's tag
(`cloArmTagOfTy`, at the closure's own function type where `cloBoxOwnFnTy` names one), then the
closure, then `struct.new`.

## The change

- **Plan.** `HoleBoxArm` gains `clo`. `holeBoxPlanOf` answers it ahead of the value-atom gate,
  for a closure into a union with a closure arm (`unionClosureArmTyOfTy`). Its `hbKind` is the
  union type.
- **Shared writer.** `holeBoxHead`'s `clo` arm is `cloArmBoxHead`. The closure rung of
  `emitUnionCoerceList` writes through it too, so legacy's bytes are unchanged.
- **IR.** `boxPlanWhy` takes a closure rep for the arm, and `boxOp` reads the operand between
  head and tail.

Stacked on `ir-box-map-arm`, which adds the `map` arm the same way.

## Witness

`tests/cases/unions/closure-boxed-under-its-closure-arm.vl`: a returned lambda and a bound
closure delivered into `((x: i32) => i32) | i32`. Two of its five functions stop at `box ladder`
under the merge-base seed; all five are covered and matched after. Row file
`tests/ir-shadow-rows/closure-box-arm.vl`.

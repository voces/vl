# IR: a `boolean | null` boxed into a wider union as its niche (2026-11-22, lane IR-N2)

`box ladder`, the nullable rung. A `boolean | null` delivered into a union that admits `null`
(`boolean | i32 | null`, `boolean | string | null`, `boolean | f64 | null`) missed at
`box ladder`. The plan's niche rung excludes a boolean niche (`exprNulBool`).

Legacy writes it in `emitUnionBoxNulNiche`'s boolean arm. It parks the value in a scratch slot,
tests it against 2 (the niche's null), and writes the union's null box, or the bool atom's tag,
the value's bool box and the union box.

## The change

- `nulBoolBoxesInto` (`emit_plan_union.vl`) names the arm's decision once: the value is a boolean
  niche, the union admits `null`, and the module has a bool value box. `emitUnionBoxNulNiche` and
  `holeBoxPlanOf` both ask it.
- `HoleBoxArm` gains `nulBool`. Its head takes the slot (`nulBoolBoxSlot`), and its tail is the arm's
  null test and boxes (`nulBoolBoxTail`), split out of `emitUnionBoxNulNiche`, which now writes
  through them. Legacy's bytes are identical over the ladder-census files.
- The IR takes the arm's operand at the boolean niche's rep (`repBoolNiche`).

Covered = matched over the files the ladder census named: 646 → 650.

Row file `tests/ir-shadow-rows/nullable-boolean-boxed.vl`; witness
`tests/cases/unions/nullable-boolean-boxed-into-wider-union.vl`.

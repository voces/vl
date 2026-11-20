# A record or a scalar list boxed into a union (2026-11-20)

After #9193 the shared box plan (`holeBoxPlanOf`) took scalars, literals and boxes into any union
box; a record or a list still fell to legacy's ladder (`box ladder`).

## Shape
- **Records: the `rec` arm.** `emitUnionArmValueBox` boxes a non-null record by two plain rungs:
  `emitUnionWideArmBox`'s last branch (the arm its row subtypes) and, failing that, the arm of its
  own variant when it is built on that variant's heap. Both write the arm's tag, the ref and
  `struct.new $box`. `wideArmPlainOf` is the first rung's decision, and `emitUnionWideArmBox` now
  calls it; `armValuePlainOf` is both rungs, read by the plan for a struct or variant value. A
  value that may be null, a box, or a record rebuilt onto its arm stays the ladder.
- **Scalar lists.** For a value typed as a list (not a literal, a ref-element list, a closure or an
  atom list), the plan reads the value-atom kind the ladder reads (`coerceValueAtomKind`,
  `coerceListAtomOf`); a list kind is written by the `atom` arm, which for a ref kind is the tag,
  the list and `struct.new $box`, exactly `emitUnionCoerceAtomBox`. The builder takes the list
  itself as that payload.
- Legacy's `emitUnionBoxArg` reads the plan first, so its record and list boxes move onto
  `emitHoleBox`; the corpus measures that path byte-identical.
- One import of the checker's `tyBearsNull` raises `emit_plan_union.vl`'s phase-state surface
  74 → 75: the rung's own nullable test, which no emit-layer reader answers.

## Measured
See the PR body.

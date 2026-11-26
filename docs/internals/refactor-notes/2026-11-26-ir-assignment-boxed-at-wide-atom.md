# IR: an assignment boxed at a wide number arm (cov-is-54)

Lane COV-IS, 2026-11-26. Regen-10 row `box ladder` on
`tests/cases/literals/hex-width-through-assignment-value.vl` (`nullableTail`).

## Change

- `holeBoxPlanOf` (`compiler/emit_plan_union.vl`) returned `ladder` where the value's widen plan
  at the union's wide number kind was `asgLit` or `radix` (an assignment whose value is its literal
  or its cell at that width). It now returns `atom` at that kind with no source kind. Legacy's
  `atom` writer is `emitCoerceAtomPayload` → `emitWidened`, which writes both plans, as its ladder
  did.
- The builder (`boxTempIn`) widens such an assignment's value to the atom's kind with `widenTo`
  (`asgAtomValue`) before the box, and re-notes the assignment's span to end at the widened value,
  so the box's tag is still written ahead of the store. `boxPlanWhy`'s `atom` arm accepts a
  widened number at its kind (`irBAtomKindRep`).
- `convert` stays on the ladder.

## Measurements

- `hex-width-through-assignment-value.vl`: claimed whole, its `@log` lines under
  `VL_IR_REQUIRE_CLAIM=1`.
- Sweep `tests/cases/literals/assignment-value-boxed-at-wide-atom-positions.vl`: return,
  argument, binding, record field and list element; `i64 | null`, `f64 | null`, `f32 | string`.
  Master: 3 `box ladder` misses. A map value position then misses at `map store value store`,
  a separate rung, and is left out.

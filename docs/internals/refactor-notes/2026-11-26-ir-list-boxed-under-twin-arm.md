# IR: a ref list boxed under its twin arm's tag (cov-is-55)

Lane COV-IS, 2026-11-26. Regen-10 row `box ladder` on
`tests/cases/unions/nested-numlit-list-twin-row-box.vl` and the D16894 witness.

## Change

- `holeBoxPlanOf` (`compiler/emit_plan_union.vl`) gains legacy's twin rung from
  `emitUnionCoerceRefArray`: a ref-element list that is no literal, whose own slot is no arm of the
  union, rides under the one list arm whose wrapper is its slot's (`refArrTwinArmSlot`, moved here
  from `wasmEmit.vl`). It is planned as `refList` at that arm's tag, which writes what the rung
  wrote: the tag, the list, the box.
- A list literal still reaches the literal rungs (`emitUnionListLitViaRefArm`,
  `emitUnionNestedListLit`) first, so the twin rung is asked of no literal.

## Measurements

- `nested-numlit-list-twin-row-box.vl` and the D16894 witness: claimed whole, `@log` lines under
  `VL_IR_REQUIRE_CLAIM=1`.
- Sweep `tests/cases/unions/list-boxed-under-twin-arm-positions.vl`: argument, binding, return,
  assignment, record field and list element; output equals the `VL_IR=0` run.

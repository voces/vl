# IR box ladder: an assignment boxed on its target's plan (2026-11-25, lane COV-IS)

- **The miss**: `box ladder` for an assignment value. `holeBoxPlanOf` answers `ladder` for an
  assignment whose widen plan is `asgLit`, `radix` or `convert`; legacy's ladder writes the union's
  tag, the store, then the stored literal's box. The plan is shared with legacy.
- **What landed** (the general form, coordinator ruling after #10171): where an assignment's own plan
  is the ladder, `boxTempIn` boxes it on its target name's plan when that is an `atom` box, keyed at
  the target (`bxAt`), so the lowering reads the same plan; the assignment's span still leads, so the
  tag is written ahead of the store as before. No arm is added to the shared plan, and legacy's
  bytes are untouched.
- **The class** (`VL_IR_SHADOW=2`): `assignment/value-after-a-lead-f64-lit.vl`'s 2 `box ladder` rows
  match. `literals/hex-width-through-assignment-value.vl` (a `radix` target, itself a ladder) and
  `soundness/null-assignment-value-at-its-destination.vl` (a `null` store; the target's plan is a
  niche box the stored value does not fit) stay; a wider arm set only moved the latter to `box
  nulNiche`.
- **Q58 position sweep** (`tests/cases/assignment/float-literal-assignment-boxed-into-union-positions.vl`,
  new): an argument, a record field, a list element, a `let`, a hole and a return. On master its 6
  functions are this miss; here all 68 match.

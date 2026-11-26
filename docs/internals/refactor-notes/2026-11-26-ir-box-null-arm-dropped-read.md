# IR: the box plan's `null` arm takes a dropped null-unit read (2026-11-26)

Lane COV-IS, class `box null` (coordinator routing 2026-11-26).

In the instance of an un-annotated parameter bound to `null`, a `?.` chain on it (`a?.f(4)`) is
that instance's `null`: the plan's `null` arm names it (the node reads as a `null` literal), but
the builder builds it as a null-unit read, not the literal's immediate, so `boxPlanWhy` missed
(`box null`). `boxTempIn`'s null-box rung, which already boxed a dropped null-unit read
(`nulReadDropped`) as the destination's null box under the ladder, now also takes it under the
`null` arm. Legacy writes the bare null box there.

Measured:

- `tests/cases/closures/optional-call-hole-param-nullable-record-positions.vl` (the coordinator's
  witness, `const r = a?.f(4)`): `p2` and its sibling instance missed with `box null` on master;
  here the program claims whole, byte-identical, and runs under `VL_IR_REQUIRE_CLAIM=1`.
- Over `tests/cases` and the distilled `cells` and `named` sets, against master's compiler, that
  is the only program that changes.
- Sweep `tests/cases/closures/optional-chain-on-null-instance-positions.vl` (bound, a field,
  assigned, a list element, tested): on master 1 function misses with `box null`; here none.

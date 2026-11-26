# IR: a lead no stage can hold is spilled to a local (2026-11-26)

Lane COV-IS, regen-10 class `null name test of a non-name null side`; COV-UNION's stage machinery
(coordinator ruling: "stage on the stack, else spill the lead").

`irBSpillLeads` sets each variable or temp lead into a local of its own (an `SAssign` into a fresh
`local`, written `local.set` and read `local.get` at its use, outside the live-stack rules) at the
point the later operands begin; an immediate is written at its use. Two consumers:

1. A `null` name test whose right side has an effect the test must not see (`w == (w = null)`,
   `z == nothing()`, `g() == mk().tags`) builds the test first, spills it, then the right side.
   Legacy writes the same order through its scratch stash.
2. `irBStageLeads` spills where it declined: below a receiver stage or a void `if`.

Measured (against master's compiler, over `tests/cases` and the distilled `cells` and `named` sets):

- Four programs change. Claim whole, `VL_IR_STRICT=1` and `VL_IR_REQUIRE_CLAIM=1` clean:
  `eval-order/null-unit-read-beside-effectful-operand.vl` (`run`, `@start`),
  `null/assignment-of-null-compared-right-positions.vl` (`sameName`),
  `null/null-unit-call-assign-compared-with-other-nullable.vl` (`call`, `effects`). And
  `types/infer-null-hole-if-coalesce-in-each-position.vl` `concat` leaves `string operand after
  another` and claims.
- `ir-parity --behaviour-only` over those four and the sweep: same; the bytes differ in locals
  (not a gate since #10329).
- The staged-operand sweeps COV-UNION named do not move.
- Sweep `tests/cases/null/null-name-test-effectful-right-side-positions.vl`: on master 6 functions
  miss with `null name test of a non-name null side`; here none.

# IR: a lead no stage can hold is spilled to a local (2026-11-26)

Lane COV-IS, regen-10 class `null name test of a non-name null side`; COV-UNION's stage machinery
(coordinator ruling: "stage on the stack, else spill the lead").

`irBSpillLeads` sets each variable or temp lead into a local of its own (an `SAssign` into a fresh
`local`, written `local.set` and read `local.get` at its use, outside the live-stack rules) at the
point the later operands begin; an immediate is written at its use.

Its consumer here is a `null` name test whose right side has an effect the test must not see
(`w == (w = null)`, `z == nothing()`, `g() == mk().tags`): the test is built first, spilled, then
the right side, the order legacy writes through its scratch stash.

Not done: spilling in `irBStageLeads` where it declines (a receiver stage, a void `if`). Tried,
it reds `tests/vl_ir_shadow_test.ts` "a push of a short-circuit value stages its receiver ahead
of the if" (`operand above a valued if's value` in `arg`): a caller relies on that decline. It is
left to COV-UNION's machinery.

Measured (against master's compiler, over `tests/cases` and the distilled `cells` and `named` sets):

- Three programs change, each claimed whole, `VL_IR_STRICT=1` and `VL_IR_REQUIRE_CLAIM=1` clean:
  `eval-order/null-unit-read-beside-effectful-operand.vl` (`run`, `@start`),
  `null/assignment-of-null-compared-right-positions.vl` (`sameName`),
  `null/null-unit-call-assign-compared-with-other-nullable.vl` (`call`, `effects`).
- `ir-parity --behaviour-only` over those three and the sweep: same; the bytes differ in locals
  (not a gate since #10329).
- The staged-operand sweeps COV-UNION named do not move.
- Sweep `tests/cases/null/null-name-test-effectful-right-side-positions.vl`: on master 6 functions
  miss with `null name test of a non-name null side`; here none.

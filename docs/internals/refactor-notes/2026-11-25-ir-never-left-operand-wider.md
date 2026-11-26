# IR operator over a left `never` operand beside a wider one (2026-11-25, lane COV-IS)

- **The miss**: `never operator over a non-i32 operand`. Legacy writes an operator beside a `never`
  operand at `i32` (D17064); the builder took only an `i32` sibling.
- **What landed** (the general form, behaviour parity after #10171): beside a wider sibling (`f64`,
  `f32`, `i64`), the operator is computed at the sibling's width (a compare yields `bool`). A left
  `never` call's temp takes `i32`, its consumer's rep (the verifier's never-call-temp rule), and a
  plain widen converts it to the sibling's width, legacy's `convert(unreachable)`; a left `never`
  operand that is not a call is a named miss (`never operand not a call`). A right `never` beside
  a wider left stays this miss.
- **Parity**: `soundness/never-operand-beside-a-float-one-runs.vl` (5 functions, master's whole
  class), the sweep and `ir-shadow-rows/never-operand-beside-a-wide-one.vl` read `same` with no
  byte differ (`ir-parity.vl --files`).
- **Q58 position sweep** (`tests/cases/soundness/never-left-operand-beside-a-wider-one-positions.vl`,
  new): an add, a divide, a compare, a `let` and a call's argument. On master 5 functions are this
  miss; here all are claimed.

# IR operator over a left `never` operand beside a wider one (2026-11-25, lane COV-IS)

- **The miss**: `never operator over a non-i32 operand`. Legacy writes an operator beside a `never`
  operand at `i32` (D17064); the builder took only an `i32` sibling.
- **What landed** (the general form, behaviour parity after #10171): beside a wider sibling (`f64`,
  `f32`, `i64`), the operator is computed at the sibling's width (a compare yields `bool`). A left
  `never` operand is built for its effect and dropped; a zero at the sibling's width stands in its
  place, which no path reads, since the call diverges first. A right `never` beside a wider left
  stays this miss (its left operand would sit pending across the drop).
- **Behaviour parity**: `soundness/never-operand-beside-a-float-one-runs.vl` (5 functions, master's
  whole class) is claimed in full and reads `same, behaviour`; a variant whose last call takes the
  `never` path reads `same, behaviour, trap: wasm unreachable`.
- **Q58 position sweep** (`tests/cases/soundness/never-left-operand-beside-a-wider-one-positions.vl`,
  new): an add, a divide, a compare, a `let` and a call's argument. On master 5 functions are this
  miss; here all are claimed.

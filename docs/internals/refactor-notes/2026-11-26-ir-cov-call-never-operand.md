# IR: a never left operand widens from what its temp holds (2026-11-26, COV-CALL)

**Mechanism.** `neverWidened` widens an operator's left operand, a call that never returns,
to the other operand's width. It wanted the call's temp at no value and missed
`never operand not a call` otherwise.

The call's temp now arrives at `i32`, the rep the function then gave it anyway. A nested
operator's left operand is itself never-typed (`(fail() + x) * 2.0`), so it arrives already
widened: at the outer width, or at its own (an `f32` sum compared with an `f64` literal).

The rule is now:

- a temp at no value or `i32` is read at `i32` and widened;
- one already at the destination stands;
- one at another numeric width is widened from that width;
- anything else is still the miss.

**Census.** Regen-10's `never operand not a call` class (COV-CALL) has 11 units, all claimed:

- soundness/never-left-operand-beside-a-wider-one-positions: 5 units;
- soundness/never-operand-beside-a-float-one-runs: 5 units;
- D17064's witness.

Each builds with `VL_IR_REQUIRE_CLAIM=1` (rc 0) and prints what legacy prints.

**Q58.** `tests/cases/soundness/never-operand-nested-wider-positions.vl` covers a nested never
operand returned, bound, compared at `f32`, as an argument and in an `i64` chain. On master,
`VL_IR_REQUIRE_CLAIM=1` declines it (`never operand not a call`). On this branch it builds and
prints the `@log` list.

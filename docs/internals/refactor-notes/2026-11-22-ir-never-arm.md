# IR coverage: value and tail arms that never return (2026-11-22, lane IR-N7)

This follows `ir-tail-arm-stmt` (the one-arm match's trap else), and the coordinator approved it
as one PR. Two shapes of the never-valued arm stayed misses:

- **A value `if` arm whose value is a call that never returns** (`rep novalue`). Legacy's
  `emitBlockValueAsGo` writes the call as the arm's value. It leaves nothing, and the `if`'s `end`
  is stack-polymorphic. The IR's `ifArm` now builds that call as its statement (`callIsNever`,
  legacy's own record) and assigns no out.
  - Where legacy widens an arm's value it widens the dead one too (`emitWidened`, an
    `f64.convert_i32_s` after the call). `blockValueWidenKind`, split out of
    `emitBlockValueAsGo`, is that decision, and the IR asks it: such an arm is the named miss
    `never arm widened`.
- **A tail arm whose last statement follows an exit** (`dead tail arm`): the checker leaves a
  statement after the trap. Legacy's `emitStmtsTail` writes the arm's statements, then
  `emitDeadTail`'s `unreachable` for the dead last one. The IR's `tailArm` now does the same.
  - A dead tail that is a nested function declaration still takes legacy's statement path, so it
    is the named miss `dead tail declaration`.

## Measured

Against master 5f8d0483's fixpoint seed, with `ir-tail-arm-stmt` beneath:
- `tests/cases` goes from 68,389 matched (`ir-tail-arm-stmt`) to 68,414, with no new mismatch,
  across 17 files;
- the never-arm and dead-tail families account for all of the rise.

The row `tests/ir-shadow-rows/never-arm.vl` has 7 functions. Of its 4 at i32, on master's seed 3
are `rep novalue` or `dead tail arm`, and here all 4 are covered and matched. Its 3 at i64, f32
and f64 are `never arm widened`.

# The hoisted `for` walk and the `forInLoopOpen` re-entry (2026-11-19)

The builder missed a walk whose body is hoist-safe (`for in hoisted`): legacy reads its header once
and, under `partialUnrollCost`, runs the body in `PARTIAL_UNROLL_COPIES` unrolled copies ahead of
the rolled loop. `forInLoopOpen` wrote those copies with `emitStmts`, so a claimed walk would
have re-entered legacy's statement writer for its own body (§10.1(a), `ir-design-2026-11.md`).

## Shape
The seam template (`2026-11-19-ir-seam-frame-model.md`): halves both emitters call, no callbacks.
- `forInHeaderHoist` is the header decision and write after the list is stored (the hoisted
  backing and `len`, and the view flags a non-hoisted walk sets), shared by `emitForInStmt` and
  the IR's `forIn`.
- `forInLoopOpen` is now `forInBreakOpen`, the copies, and `forInRolledOpen`.
- The copies split into `forInCopiesOf` (the decision, a `ForInCopies` or null), `forInCopiesHead`,
  `forInCopyOpen(k)`, `forInCopyClose`, and `forInCopiesTail`. Legacy's `emitForInCopies` calls
  them around `emitStmts`; the IR's `forIn` calls them around its own body.
- The IR lowers the walk's body once per copy and once for the rolled loop. Each lowering
  restores the temps' definition and use marks taken before the first (`tempMarks`), so every
  copy defines and uses its temps afresh.
- `walkFrames` labels each frame a half opens: the walk's break block carries `xfBrk`, the current
  continue target (a copy's continue block, or the rolled loop's) carries `xfCont`.
- The body's index hoists open through `irLoopHoistOpen`, as a `while`'s do; the lowering no longer
  misses a walk that opens one.

## Measured
See the PR body.

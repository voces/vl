# START-2: `for range dynamic step` (2026-11-26)

Regeneration 9's unowned class, claimed through CENSUS (it was in START-2's first share). Graded
on master 44be9fd1, its three programs (`loops/for-step-expression.vl`, `loops/loop-control-matrix.vl`,
`loops/range-edge-step-ends.vl`) are fully claimed.

A step that is not a literal is legacy's third slot: `emitForRangeStmt` evaluates it once after
the bounds, and `emitRangeTest` selects the ascending or descending test by the step's sign (a
zero step runs nothing). The IR already wrote partial and wrap-exit range loops through those
helpers (`SRangeLoop`). Now `forRangeTestOf`, which only the IR reads, gives a dynamic step its
slot and `dynStep`. `forRangeStmt` builds the step into that slot and routes the rolled loop
through `SRangeLoop`.

`ir-parity --run-all --behaviour-only`: byte-identical on the three programs and on the sweep,
which misses the class six times on master: up, down, zero, `until`, `continue`, a call step, the
`i32` edge, and a start-body loop.

# D16102 — a field write's narrowing outlives a call that rebinds its receiver (2026-11-14)

Lane B, found grading D16019; clause 1.

## Change

`compiler/check_narrow_flow.vl`, `retireNarrowingsForWrite`: the path narrowing a non-null write
pushes (the assignment narrowing's path twin) is skipped when a call in the right-hand side may
write the place. The check is `writeRhsCallMayWrite`, which walks the right-hand side, skipping
function bodies, and asks `callMayWrite` per call; for a path that rule also covers writes to the
receivers above the place. The call rule already retired narrowings live before the call; this
covers the one the write itself makes after it.

## Measured

- New matrix `scripts/capability-probes/matrix/write-after-receiver-rebind.matrix.vl`: 12 of 56
  to 56 of 56. Before, the other 44 cells passed `vl check` and trapped (clause 1). 0 silent,
  0 runs → not-runs. Before = the D16019 head, fixpoint.
- RESULTS-PENDING

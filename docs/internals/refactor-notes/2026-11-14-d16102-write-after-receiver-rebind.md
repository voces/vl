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
- Sweep against the D16019 head (both fixpoint seeds), over 24,379 programs:
  - 2 output movers, each trap → runs: the D16102 witness and the new case;
  - 0 bytes-only movers, 0 check-reject movers, 0 runs → not-runs, 0 new compiler traps;
  - so the skipped narrowing turns no other program into a check refusal.
- The wider-record, record-field-read, field and element matrices are unchanged at 54, 54, 50
  and 50, 0 silent.
- Also files [D16103](../inventory/D16103.md) and [D16104](../inventory/D16104.md), the write
  D16019's move declines: an operand read before the target that the right-hand side changes.

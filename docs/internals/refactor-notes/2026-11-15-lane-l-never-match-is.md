# An `is` that can never match is a warning, the D16047 ruling — 2026-11-15

Lane L, the owner's 2026-11-14 ruling: an `is` test whose type can never match its operand is a
warning, and the branch that cannot run reads the operand as `never`.

## What moved

- **The refusal is decided at the program's end.** The `is` gate still raises its refusal and
  notes the test (`neverIsNote`, check_side_rows.vl). `settleNeverIsTests` (check_operators.vl)
  turns each refusal that survived the check into the warning, banks the test as `never`, which
  the emitter answers `false`, and marks each `if` arm it guards dead, so that arm emits as
  `unreachable`.
- **Within a pass the arm reads `never`.** The narrowing gives the operand `never` while the
  test's refusal stands in that pass's diagnostics (`neverIsRefusedNow`), for `if`, `while` and
  the right of `&&`. A `never` receiver's member, call and index are `never`.
- **A narrowing-only impossibility is unchanged.** A test only a narrowing made impossible, of an
  operand whose declared type may match, keeps its run-time test and its existing warning
  (`isDeadByFlowWarn`).

## Why at the end

A first cut warned and banked `never` at the gate. Speculative passes discard their diagnostics
but not the warning table or the banks, so a test a discarded pass saw at a wider type folded to
`false` in a program where it holds (`objects/record-literal-widened-box-two-members` printed
`lost f32`). Reading the decision from the surviving diagnostics leaks nothing.

## Evidence

- Matrices `--before` the master fixpoint: `never-matching-is-test` 2 of 64 ran, all 64 run;
  `annotated-empty-map/set-delivered-into-union-is` 36 to 64 of 64;
  `annotated-empty-list-delivered-into-union-is` 0 to 61 of 64 (the three left are D16342's).
  0 runs → not-runs, 0 silent.
- Seven fixtures that pinned the refusal pin the warning; D221 and D228 re-graded to runs.

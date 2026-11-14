# An assignment delivered at its target's type: D3785 closed, 2026-11-14

Lane D. One rule in `assignableExprIn`: a plain `=` store whose target is typed as the destination
delivers the value it stored (`asgStoredAt`). Net compiler lines: +9. Pin-helper delta: 0.

## Why at the delivery and not the expression's type

`asgYieldsPlaceTy` already makes some assignments yield their place's type. Widening it to
literals would retype `const a = (x = 0xff)` to `f32`, so `print(a / 2)` would print `127.5`
instead of `127`, an output change for a running program, and D3785's grading list keeps it `i32`.
The emitter already reads a store's value at a use of the target's width (D3733), so only the
checker's grading had to admit it.

## Measured

Fixpoint seeds on both sides, against master `495c1ff8`:
- `tests/cases`, all 8,032 files: 0 `runs → not-runs`, 0 output changes. The two new fixtures
  are the only movement.

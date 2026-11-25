# COV-CALL: `__trap__` read as a value (2026-11-25)

Lane COV-CALL, class `intrinsic none` (every row is a `__trap__` call).

## Mechanism

The IR built `__trap__(msg?)` only as a statement (`trapStmt`). Read as a value, it fell through
`callRhs` to `numIntrRhs`, whose table has no arm for it. That covers the arm an exit leaves in a
value `if` or `match`, which the rewrite spells `__trap__()`, and the minted wrapper of
`const t1 = __trap__`.

- **Builder:** `trapCallRhs` streams the message as `trapStmt` does, then yields `RDeadNever`:
  legacy's `unreachable` from `emitCallCoreTrap`. It carries no pad, because `callEndsNever`
  exempts the trap intrinsic.
- **Lowering:** `ret` writes a returned trap's `unreachable` with no `return` after it
  (`retIsTrap`). Legacy writes none, so the function's end pad follows directly.

## Census (`CENSUS_CLASS=classes/intrinsic-none-trap.txt`, rows)

| row | before | after |
|---|---:|---:|
| `intrinsic none` | 11 | 0 |

Every class program builds the same bytes armed and strict as the base seed's default build.

## Proof

- **Q58 sweep:** `tests/cases/control/value-arm-exit-trap-positions.vl` puts the exit arm at a
  `const`, a `let`, an `else if`, a `match` arm and a loop's `break`, plus the bare intrinsic as a
  function value. On master one of its functions misses on this row; with this change none, and all
  match.

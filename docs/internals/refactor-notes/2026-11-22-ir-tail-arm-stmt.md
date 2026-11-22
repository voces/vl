# IR coverage: a tail arm's last statement, decided by legacy's own question (2026-11-22, lane IR-N7)

A one-arm block `match` desugars to `if true { block } else { __trap__() }` (D5713). The minted
`__trap__()` is checked only under `inferQuiet`, so it has no recorded type. In return position the
IR built it as the arm's value and missed `rep ?` (3 `tests/cases` functions,
`match/one-arm-block-value.vl`).

## Mechanism

`emitStmtTail` writes a tail arm's last statement as the arm's value when `stmtIsTailValue` or
`memberCallYieldsValue` answers, and otherwise as a statement through `emitStmt`. A call that never
returns is neither, so legacy writes the trap as its own `unreachable`. The IR's `tailArm` asked a
different question, `ifArmValueExpr(blockIx) != last`, and delivered the trap as a value.

## Change

- **`tailArmStmtIsValue`** (`wasmEmit.vl`) is legacy's decision split out of `emitStmtTail`, which
  now asks it first.
- **`tailArm`** asks it too. Where it answers false and the arm's value expression is the last
  statement, the IR builds that statement with `stmtNode`. Like `emitStmt`, `stmtNode` banks no row
  of its own: `stmt` noted one and the spans differed, 1 against 2.

## Measured

Against master 5f8d0483's fixpoint seed, `tests/cases` goes from 68,380 to 68,389 matched, with no
new fail:
- 3 in `match/one-arm-block-value.vl`;
- 5 in `generics/eq-generic-call-operand-stored-apart.vl`;
- 1 in `closures/hole-fn-labelled-block-left-by-break.vl`.

The row `tests/ir-shadow-rows/tail-arm-never-statement.vl` has 3 functions; all 3 are `rep ?` on
master's seed, and here all 3 are covered and matched.

Still open: a value-position `if` whose arm is a never call (`rep novalue`), and a returned `if`
whose then arm is one (`dead tail arm`). Both go through other writers.

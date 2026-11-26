# A push receiver that holds its own branch (lane COV-UNION, 2026-11-26)

## The row

`push short-circuit operand` in regen-10 (`shared-let-without-zero-value.vl` `__lambda_4`,
`list-op-receiver-any-expression.vl` `@start`, `short-circuit-write-may-not-run.vl` `opt`).

## The change

- `pushRhs` looked for a statement below the receiver from the receiver's own start. Legacy writes
  a receiver that holds a branch (a `??`, an `if`, a captured cell's guarded read) whole into a
  local before the value, so no lead is waiting under that branch. The check now covers only the
  value's range, where a statement would sit below the receiver.
- `pushRecvReadAtUse`: a receiver read at its use on both paths needs nothing staged below the
  value's statements. That is a local, or a temp recovering a local (`RRecover`, an optional
  receiver's narrowed read) that no assignment in the value writes; that temp's `SLet` moves below
  the value, where legacy reads the local.

## Measured

- Sweep `tests/cases/lists/push-receiver-holding-its-own-branch-positions.vl`: master blocks five
  functions and the start body on `push short-circuit operand`; on the head none block,
  `VL_IR_REQUIRE_CLAIM=1` exits 0 and the `@log` lines hold, including a value that reassigns the
  local receiver.
- Census A/B and `ir-identity --cases`: see the PR body.

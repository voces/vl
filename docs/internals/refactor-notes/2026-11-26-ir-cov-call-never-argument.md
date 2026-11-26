# COV-CALL: a call whose argument never returns (2026-11-26)

Lane COV-CALL; census row `callee signature`, the `never` parameter family (the distilled
`d16261_*` cells and the D16260 witness).

## Mechanism

`id(fail())` instances `id` at `never`. Its parameter has no value rep, so `calleeSig` refused the
call. Legacy writes the `fail()` call, then `call $id (unreachable)`: the call is dead past the
argument.

- `directCallAt` asks `neverArgOf` before signing the callee. With an argument typed `never`,
  `deadCallAfter` builds that argument's call as a statement and the call as `RDeadNever`, the
  `unreachable` the IR already writes for a dead `never` value. Effect-free arguments before it
  are written as nothing; any other misses by name (`dead call argument before`).
- The `RDeadNever` statement lowering, which took only a dead call through a field, takes any
  call. It drops a value only where a member call yields one.
- `irNodeEndsPath` counts `RDeadNever` as ending its path, so a returned dead call is the
  `return` legacy writes after it (`returned never call`).

Byte identity is informational (#10171). The IR writes no `call $id` after the `unreachable`, so
the locals prefix differs.

## Proof

- **Census:** the three `never`-parameter programs (`d16261_generic`, `d16261_named_fn`, D16260)
  no longer miss on `callee signature`. `d16261_generic`'s `id` instance at `never` misses on
  `void return value`, another row. `closures/dead-field-call-positions`' `callee signature` is
  the open-result family (`result _`), not addressed here.
- **Q58:** `tests/cases/functions/never-argument-call-positions.vl` puts the dead call at a
  statement, a typed binding, a `print` argument, a returned value, an argument of another call
  and after an effect-free argument. On the master seed six functions miss on `callee
  signature`; on this branch all six are covered, and the armed run prints the `@log` list.

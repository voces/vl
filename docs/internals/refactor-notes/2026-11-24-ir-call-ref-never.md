# IR: a function-value call whose result is never, 2026-11-24

Lane IR-N4. Base: master 9fa2d27a with #9801 (batch 2), the tree of merge train HA1. Batch 3 of
`call of a non-declaration`, the last: `callRefPlainKey`'s `callEndsNever` refusal.

## Change

- `RCallRef` carries `crNever`, set from `callEndsNever(ix)` at both constructions (`closureCallAt`
  and `capturedCallRhs`).
- `callRef` lowering refuses the tail form under `crNever` and writes `unreachable` after
  `call_indirect`, as `emitCall` follows `emitCallCore`. The statement tail site and `callReturns`
  refuse it too.
- `irNodeEndsPath` returns `crNever`. The verifier's never-temp admission (`neverCallTemp`) admits an
  `RCallRef` temp under `crNever`. In value position a closure call already takes `irBLetTemp`, the
  route `RCall`'s `caNever` takes.
- A call statement through a member or expression callee keeps no never flag
  (`stmtCallRefNever`): legacy's statement ladder writes it through `emitCallRef` directly, not
  `emitCall`, so no `unreachable` follows it. A named callee's statement goes through `emitCall`
  (`emitCallStmtIdent`) and keeps it.
- `callRefPlainKey` drops its `callEndsNever` refusal. `cloTailRefusal` stays: that is legacy's own
  `emitFail` (D2878).

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `callEndsNever` (existing) | `emitCall`'s `unreachable` after `emitCallCore` |
| `stmtCallRefNever` | `emitCallStmt`'s member and expression-callee arms, which call `emitCallRef` |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

READINGS

# IR: one closure-call argument decision, and a record's function field called, 2026-11-20

A call through a function value writes each argument by `emitCallRefArg`'s ladder: a widening, a
refusal, the union-arm and box arms, an atom's string, or the general arm. `callRefPlainKey`, the
IR's test for a plain closure call, re-derived part of that ladder in its own argument loop. A
call through a record's function field (`{ f: g }.f(x)`) missed as `method f`.

## The change

- `callRefArgArmOf` (wasmEmit.vl) returns the arm, a closed set (`CallRefArgArm`, lint set 67), in
  the ladder's order. `emitCallRefArg` dispatches on it with an exhaustive `match`.
- `callRefArgPlain` is the plain test over that arm: the general arm, at a scalar of its own
  width, a string, or a record neither unboxed from a narrowing nor nullable. It admits what
  master's loop admitted. `callRefPlainKey`'s argument loop asks it.
- `callRefPlainKey` splits into a callee head and a shared tail (`callRefPlainTail`). The head is
  a binding as before, or a function-valued field of a record with no bundle or held record
  (`fieldCallRefPlainHead`), which legacy's `emitCallCore` sends to `emitCallRef`.
- `fieldCallStmtVoid` is the drop decision of a field call statement; legacy's member statement
  arm and `callRefPlainVoid` both ask it.
- The builder sends such a field call to `closureCallRhs`, but only where no named method arm took
  the call. Asked first for every method call, it cost +0.115% L2 fuel.

Compiler lines are +188 −102, 86 net (`wasmEmit.vl` +177 −100, `lint.vl` +9 −2, `ir_build.vl` +2).
Most of that is the arm's `match` and the closed set. No legacy line is deleted; the ladder's
conditions moved into `callRefArgArmOf`.

## Readings (base master `c13255ce8`, fixpoint seeds on both sides)

| reading | master | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 16,846 | 16,849 (+3) |
| corpus covered = verified = matched (shadow) | 37,467 of 45,678 | 37,475 (+8) |
| corpus `method f` alone (census) | 58 | 0 |
| L2 self-compile fuel | 101,026,948,944 | 101,056,609,296 (+0.029%) |

Behind the field calls this clears sit other misses: 40 corpus functions name `method f` with
`open temp type`, an argument the plain arm does not take.

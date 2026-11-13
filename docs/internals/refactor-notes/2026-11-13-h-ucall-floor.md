# 2026-11-13 — lane H: unionNameOfCall's rowless declared-callee name is a loud floor

`unionNameOfCall`'s declared-callee rung (emit_classify) reads the row of the callee's return
annotation (`arw`). When the call's type keyed neither that row nor its widened row, it still
returned `tyNameOf(fn.fnRet)` with no row. Three decisions downstream read that name:
`unionMemberSetOfRow(-1, name)`, wasmEmit's `unionSetHasNullTy(uname)` and
`cloBoxEqArmTy(.., -1, uname)`, and `unionNameOfExpr`'s `??` arm (`crn == cln`).

## Probe

A probe build logged every entry to `unionNameOfCall` and every reach of the rung, reported once
per program at the end of emit. Corpus: 24,170 programs.

- `unionNameOfCall` is entered 574 times in 230 programs. A control build that tags every program
  reported in all of them, so the reporting path works.
- The declared-callee branch runs in those programs, but `arw` is -1 every time (260 reaches,
  with or without an annotation row). So the rung behind `arw >= 0` is never reached on the
  corpus, neither its matching exit nor the rowless one.

## The change

The rowless exit is now `callNameFloor("a declared callee whose call type keys no row of its
annotation")`. That is a loud `emitFail` naming the contract, returning "" with no row, so no
name without a row leaves this rung. The matching exit is unchanged.

Sweep, master fixpoint against candidate fixpoint: see the PR. The census is unchanged.

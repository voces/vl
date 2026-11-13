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

Sweep with the floor alone, master fixpoint against candidate fixpoint: 24,247 same, 0 bytes-only
movers, 0 output movers. The census is unchanged.

## The `??` arm compares rows

`unionNameOfExpr`'s `??` arm returned `cln` when the two operands' names were equal
(`crn == cln`). It now compares the rows `unionNameRowOfExpr` reports for them
(`cRows[0] == cRows[2]`, a real row). A probe logged each reach. Of 18,913 programs that emit, 2
enter the arm, and the compare runs in none: one has a non-nullable default, and the other has no
union name on its left. Four hand-written `??` witnesses (two declared unions, a literal union, a
union-valued map read, and a call) are named by earlier rungs and print the same before and after.

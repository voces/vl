# IR coverage step: a push receiver staged ahead of a short-circuit value, 2026-11-20

Lane F2, to IR-REV's design check (part B of the short-circuit operand family). Measured on fixpoint
seeds of this branch and of its merge base, master `c2f0a972f`, each building this branch's source.

## Why this class

`push short-circuit operand` was the sole blocker of 27 self-compile functions, and one of several in
7 more. Legacy writes `recv.push(v)` with a non-local receiver as: the receiver, `local.set` into the
push frame's `recvRef` slot, then the value, then the append. When the value is a short-circuit, the
IR writes its valued `if` as a statement ahead of the push, so a receiver staged at the push would
land after the value.

## What landed

- `RListStage { rsgV, rsgAt }`, used only as an `SEffect`: the receiver of push call `rsgAt`, staged
  into that push's slot through legacy's `stageListRecvTail`. The builder inserts it where the value
  starts, after the receiver's own nodes.
- `RListPush.lpV` is a `PushRecv`: an operand, or `PStaged { pstNode }` naming its stage. A staged
  push has no receiver operand (`irRhsOpnds` gives `[lpX]`); the receiver lives only in the stage.
- Verifier: a staged push's stage is an `RListStage` of the same call; `stagePairsWhy` checks each
  stage is named by exactly one later push in its own body. The body walk moved into `ir.vl`
  (`irPushBodies`), shared with rule 8.
- Lowering: the stage re-asks legacy (`listOpRecvHeld` is -1 and `pushPlainWhy` is ""), else misses;
  the push half is the shared `pushValueTail` + `pushAppendTail`. No legacy change.
- Slot reuse: only the value is written between stage and push. A value that stages a list op sets
  pop bit 512, which legacy stages late (D1280) and `pushPlainWhy` refuses as `push late receiver`.
- Stack: the stage is built only when nothing is pending below the receiver (`push stage after an
  operand`), and a stage blocks lead staging like a boxed `??` (`inPlaceFrom`), so a push in a later
  call argument stays a named miss (`short-circuit argument after another`).

## Coverage and readings

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions covered | 18,623 | 18,650 (+27) |
| corpus functions matched | 41,450 | 41,450 |

Mode 3 byte-identical; identity 9,037 cells identical, 0 differ, self-compile identical; cases 7,528
identical, 0 differ; witnesses 59 same; cases A/B 7,242 same, 0 differ. Fuel +0.7%, seed +0.2%,
late demands 9 (baseline 9), late tag rows 307 (baseline 307).

Matrix: global, field and index receivers × `&&`, `||`, two `??` spellings, a nested global and a
nested field push × statement, value and call-argument position (54 cells). All 54 print the same
output under the merge-base seed and under this branch claiming every family; 0 runs → not-runs,
0 silent, 0 fail rows. 18 cells are newly matched (`&&`/`||` at statement and value position); the
argument cells miss as `short-circuit argument after another`, the `??` cells as `coalesce box after
an operand`, and the nested cells as `push late receiver`.

Witness: `vl_ir_shadow_test` "a push of a short-circuit value stages its receiver ahead of the if".

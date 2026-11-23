# IR: a union compare's null leg, a box or operand read again, and the number and list arms (2026-11-23, lane S1)

The S1 claim covers "union compare plan" (distilled mode 4: 9 fns, 9 cells, 9 sole) and "start: union
compare box" (IR-only census: 20 fns, 20 programs, 18 sole). Both were measured on master c3585bf7.

## Mechanisms

| miss | what the IR now takes | legacy's own |
|---|---|---|
| union compare plan | an operand holding `null` (`boolean \| null`, `string \| null`), both sides places: the null test, the box's null tag or `0`, the plain arm under the leg's `else` | `unionEqNulPlanOf`; legacy's legs now call `unionEqNulTestTail`, `unionEqNullTagTail`, `unionEqNoNullTail`, `unionEqNulElse`, `unionEqNulEndTail` |
| union compare box | a box that is a global or field read, read again for each later read (`ucAgain`, `irHoistRecv`) | legacy re-reads the name |
| union compare operand | an operand that is such a read, written at its use | the operand is read inside the tag's `if` |
| union compare kind | the `i64`, `f64` and `f32` arms, with the operand delivered widened (`deliver`, `numCastKindTy`); a closure or list arm, with the operand as it stands | `emitUnionEqOther` |

## Legacy tails the IR calls

`unionEqNulTestTail`, `unionEqNullTagTail`, `unionEqNoNullTail`, `unionEqNulElse` and
`unionEqNulEndTail` were split out of `emitUnionConcreteEq`'s null legs. Legacy bytes are unchanged
(`--names` A/B against master, differ 0).

## Readings

| run | before | after |
|---|---|---|
| distilled "union compare plan" | 9 cells | 2 (both a nullable record operand, the variant compare) |
| IR-only `start: union compare box` | 21 programs | 7 still list it; 14 clear it, 10 of them wholly IR-only |
| self-compile IR misses | 0 | 0 (20,298 fns) |

The distilled reading above came from this branch's own seed, on a base without #9752–#9754. The
same class has been read three ways, each with its own instrument and tree. They are not one number:

| reading | instrument | tree | distilled "union compare plan" | IR-only `start: union compare box` |
|---|---|---|---|---|
| V3, train FJ1 | `ir-shadow.vl -- --seed S --blockers` over the distilled corpus | FJ1 (on FI1: #9751–#9754) | 0 | 0 |
| S1, after merge | `VL_IR_SHADOW=4 vl check --codegen` over `cells/` and `named/` | master 0635326c | 2 cells | — |
| S1, after merge | `ir-shadow.vl -- --seed S --blockers` | master 0635326c | 2 functions | — |

The two cells on master are the variant compare (a nullable record operand,
`d2915_recn_{5,s}_eq_annot`), which #9749 does not take. The doors PR that follows clears them
(0 by both instruments). Mode 4 also counted a start body that went past a miss as covered until #9767.

Still a miss: an element read of a global list as the box (`irReadElem` only covers a list held in
a variable); the variant compare (a nullable record operand); the cross-width number compare.

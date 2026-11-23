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
| distilled "union compare plan" | 9 cells | 2 (a nullable record operand, a list operand) |
| IR-only `start: union compare box` | 21 programs | 8 still list it; 13 clear it, 10 of them wholly IR-only |
| self-compile IR misses | 0 | 0 (20,298 fns) |

Still a miss: an element read of a global list as the box (`irReadElem` only covers a list held in
a variable); the variant compare (a nullable record operand); the cross-width number compare.

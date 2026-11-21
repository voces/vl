# IR: a negated literal at the negation's width (2026-11-21, lane IR-N2)

A negated literal's magnitude can be typed wider than the negation. In `-2147483647 - 1`, the
`i32` minimum spelled as legacy's range code spells it, the checker types `2147483647` as `i64`
under an `i32` negation. The builder built the operand at its own `i64` rep, then refused the
`neg` at the negation's `i32` rep (`operand coercion`). The self-compile's `rangeMayWrap`,
`emitRangeWrapExit`, `emitRangePartial`, `emitNumExactTest`, `constFoldOp32` and `skFreshSplit`
stopped there. Legacy's unary minus writes a negated literal as one constant at the negation's
own width (`numLitTyWidth` of the negation, `emitSignedNumLitAt`).

## The change

`exprAt` (`ir_build.vl`): a `-` whose operand, under parentheses, is a number literal at a width
the checker recorded, builds through #9317's `signedLitAt` at the negation's rep. That is one
immediate, with the minus folded as the lowering folds a `neg` of one. `signedLitAt` spells the
literal at the rep's width whatever its own (`numLitAt`, legacy's `emitNumLexAt`). `numLit` keeps
the own-width check (`wide literal width`) for an unnegated literal.

## Witness

`tests/cases/numerics/negated-literal-at-its-own-width.vl` covers `-2147483647 - 1`, a plain
chain, floats, the least i64, a parenthesised operand and `-2147483648`. Under the merge-base
seed three of its eight functions stop at `operand coercion`. After, all eight are covered and
matched. Shadow row `NEGATED_LITERAL`.

## Measured

See the PR body (fixpoint seeds on both sides, merge-base `cb57cea3`).

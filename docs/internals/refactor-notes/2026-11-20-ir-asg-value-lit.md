# IR: an assignment valued as its number literal (2026-11-20, lane IR-N2)

`assignValue` built only legacy's `reRead` arm and missed every other `asgValueArmOf` arm by name.
The `lit` arm is an assignment of a number literal to a name or a closure cell, read as a value:
`return linkSiteDst = -1`, the shape of the checker's reset functions. Legacy stores, then writes
the right side's literal again at the assignment's width (`emitAsgLitAs`); a delivery at a wider
number writes it at the delivery's width instead (`widenPlanOf` arm `asgLit`, `emitWidened`).

## The change

`assignValueLit` (`ir_build.vl`): the store through `assignTo`, then `signedLitAt`, the literal
under its parentheses and minus signs as one immediate at the assignment's rep. A minus negates
the immediate as `primOp` folds a `neg` of one (integer `0 - x`, float sign bit), so the
literal is never a temp and can be rebuilt. `widenTo`'s `asgLit` arm rebuilds it at the
destination's rep in place of the immediate the operand built.

## Measured

See the PR body (fixpoint seeds on both sides, merge-base `6851d881`).

## Witness

`tests/cases/assignment/assignment-value-number-literal.vl`: `i32`, `i64`, `f64` and `f32`
targets, a negated literal, a value read inside a sum, and an `i32` assignment returned as `f64`.
Under the merge-base seed all five stop at `assignment value lit`; after, all are covered and
matched. The shadow row `an assignment valued as its number literal builds and matches` pins four.

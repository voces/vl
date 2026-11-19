# Call arguments delivered at their parameter's rep (2026-11-19)

The call-site census (coordinator's family C) named `argument coercion: atom to nullable` as the
largest self-compile argument miss (54 functions where it is the only blocker), with `atom to str`
(10) beside it. Legacy passes an atom to a `K | null` parameter as the same `i32`; the IR's call
built each argument with `irBExpr` and required its rep to equal the parameter's exactly.

The builder already has the delivery a returned or declared value uses (`deliver`): a `null`
literal as legacy's own null, a box where the checker records one, an atom into its `K | null`
(`RRetag`), an atom decoded to a string, a numeric widen. `callRhs` now delivers each argument at
its parameter's rep through it, and keeps the exact rep check after.

## Measured
See the PR body.

# Step 7: a generic call is recorded at its instance's kept-apart join, and `exprUnionCall` reads its rep, 2026-11-10

This round follows #7031 (`2026-11-10-step7-checker-instance-and-join.md`) from master `3de5b959`.
It closes the gap that note left in group 9: `lit(0, z, z)` over `lit<i64, i64>` was recorded
`i64` while its instance returns the `i64 | i32` box.

## Where the call and the instance part

Both substitute the template's result `A | B | i32`, and both get `i64 | i32`: the call in
`callFtyPinCstrs`, the instance in `elabRetOf`. After that the call took `directHoleBodyRet`. It
re-checks the body at the call's types, where the literal arm adopts `i64`, and
`directGenericNumRet` let that body result replace the substituted one because both hold numbers.
That rule is for arithmetic over a type parameter (`x / 2.0` at `i32` is `f64`). Here it overrode a
join the substitution kept apart, and the instance never takes that override.

The disagreement was not just a classifier's. `lit(2, z, z) + 1` was check-clean invalid wasm,
filed and closed as D15635.

**The fact.** `directGenericNumRet` declines when the substituted result is a union, so the call
is recorded at the join its instance returns. Non-generic `lit2` with the same body still types
`i64`, the non-generic join.

## Shadow and switch

`exprUnionCall` against `nodeRepIs(·, "union")`, over the 23,818-program sweep population:

| tree | agree | disagree |
| --- | --- | --- |
| #7031 | 171,422 | 4, in 1 program |
| this PR | 269,324 | 0 |

The call count rose because master's tree between the two runs routes more calls here
(`readCallStoreKind` is a second caller). At 100% the classifier is switched. `exprUnionCall` is now
`nodeRepIs(exprIx, "union", fnIx)` at both callers, and its ladder is deleted. Two helpers had no
reader after that and are deleted too: `fnRetUnionSid` and `nodeTyIsPureLitUnion`
(check_node_tys.vl).

## Census

The same shadow run read 31 probed classifiers, `exprUnionCall` among them. It now has no probe,
so 30.

## Proof

* fixpoint seed, 6,597,622 bytes
* `seed-size --check` +0.1%
* `late-demands --check` 6, baseline 6
* lint-self clean
* `check-filed-witnesses --strict` 4,681 as filed
* `cases_wasm` shards green, with the new fixture `generics/kept-join-call-result-in-arithmetic.vl`
* inventory refs/rows and probe-rollback tests pass

# Checker: a `?.` call through a hole parameter reads `| null` at every instance (2026-11-26, COV-CALL)

**Defect.** D17662 (unfiled: D17662, filed on COV-CLOS's branch) is clause 1, check-clean invalid wasm. It was filed by COV-CLOS's
`shared member callee nullable receiver` sweep.

**Mechanism.** On a hole parameter, `a?.f(5)` is typed as a derived hole: the callee is the
`?.` field hole (`HD_OFLD`) and the result an `HD_RET` over it. `substHoleTyReal` resolves
`HD_OFLD` through `optFieldAtPin`, which adds `| null` for a field read. Its `HD_RET` arm
returned the pinned function's result alone, so the call dropped the `null` the chain yields.

On master, a present receiver is invalid wasm as well. Mono shares the template's chain between
instances, so the body tests the receiver and writes the null arm wherever the instance's
result is `i32`.

**Fix.** `optCallPinRet` (`check_relate_core.vl`): a call whose callee hole is an `HD_OFLD`
reads `ret | null` at every instance, and a void result stays void. The rule is keyed on the
derivation, not on the call node, because by elaboration the callee is rewritten to a `Member`
(probed: `elabRetOf` read the rewritten node).

**Checker A/B.** `vl check` over all 9,662 `tests/cases` programs, comparing a seed of the merge
base with this branch's seed. One program's output changes: this PR's own positions file. On the
base it warns that `??` defaults are never used, because `i32` is never null.

**Proof.** `tests/cases/null/opt-call-on-hole-param-nullable-instance-positions.vl` covers
return, `??`, a present instance, via a `const`, into an annotated parameter, and a void method.
It prints its `@log` list, and the D17662 repro prints `true`. Under `VL_IR_REQUIRE_CLAIM=1` the
file stops at the IR's own miss `shared member callee nullable receiver`. That unit is COV-CLOS's
#10331 (coordinator ruling), so the claim check completes once #10331 lands.

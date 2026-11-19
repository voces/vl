# STORE B3: a lambda called at several signatures by a declared callee (2026-11-19)

This step follows #9084, which admitted a declared callee's lambda argument at one signature
(`arrowSetOneShape`) and left 13 rows late because their lambdas are called at two or more. The
2026-11-19 DECISIONS entry ("A container slot called at several signatures holds one instance per
signature", an application of D3975) rules how those are stored.

## Mechanism
`ftLamPlainAt` also admits the lambda when the callee is called at several signatures, provided:
- **`ftParamOnlyCalled`:** the callee reads the parameter only as the callee of a call, so each
  hole call is an arm at its own instance and the id never stands in a slot;
- **`arrowSetScalarArgs`:** every arrow fact of the set is at arguments that hold no list, record,
  map or function.

A parameter handed on or stored is a slot, one closure per signature under the ruling. That is the
bundle record, and it stays with the late decision.

## Measured (master 857a44bc1 fixpoint vs this branch's fixpoint)
- Late tag rows: 10 gone, 0 new (each `T {<lambda>}`):
  - `closures/hole-fn-param-handed-call-returning-generic`
  - `closures/hole-lambda-bundle-positions`
  - `closures/hole-lambda-member-tagged` ×2
  - `functions/hole-lambda-literal-at-two-instances-named-or-defaulted` ×3
  - `functions/hole-lambda-literal-at-two-instances` ×3
- Without `arrowSetScalarArgs`, the same 10 move and 2 programs trip net 20 ("the tag decision after
  the elaboration tagged a function set the check refused with every call's facts"):
  `functions/hole-lambda-literal-at-two-instances.vl` (`lap4`, which also calls `g([1, 2])`) and
  `functions/generic-structured-param-through-hole.vl`.
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B: see the PR.

## Left of the 13
Three rows: `closures/bundle-record-param-copied-into-a-const`,
`closures/hole-copy-chain-called-at-two-types` and
`functions/fn-value-param-copied-into-binding-called-at-another-type` (each `P {<lambda>}`). There
the parameter is copied into a binding called at several signatures: the slot of the ruling, one
closure per signature.

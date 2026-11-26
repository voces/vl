# IR: a `const` lambda's returned bundle, called at once, at the member legacy picks (lane COV-CLOS, 2026-11-26)

A `const` lambda returning a hole lambda's bundle record (`const d = () => lap((a) => a * 2)`),
its call's value called straight away (`d()(3)`), is written by legacy's `emitCallRef` as the
inner call, then the member its use takes (`topLambdaRecordFe`, `emitBundleResultPick`). The IR
built the inner call as the whole record and missed `closure callee rep`: the existing pick after
a call needs the picked member's rep to be the node's own, and here the two closure reps differ.
The outer call is now routed to `resultMemberCallRhs` (`lambdaRecordCallOf`), which builds the
record, then the member at the pick's own type, then calls it.

## Measurements

I8 census over the `tests/cases` programs (base at master `13ccb6cab`, head on it):
`closure callee rep` 1 → 0. Claimed functions 97,995 → 97,996, unclaimed 335 → 334, claimed
starts 8,458 → 8,458, claims fallen back 11 → 11; 0 claimed functions or starts lost, no other
class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on
`tests/cases/closures/hole-lambda-bundle-returned-from-lambda-in-function.vl`: base fails
(`closure callee rep` in `main`), head runs with every body claimed and prints the file's logs.

Q58 position sweep (`tests/cases/closures/lambda-bundle-result-called-positions.vl`: statement,
parenthesised callee, the f64 member, an operand, an argument, a return, a loop body, a
condition, a capturing lambda): base misses `closure callee rep` in `main` and `ret`, head none;
output identical claims-off, claims-on and on the base seed.

## Not covered

A module-level `const` lambda (`const top = () => lap(...)` at the top, `top()(3)` in a
function) is not lifted, so its inner call is a closure call returning the record; it misses
`call of a non-declaration` before and after this change. Building it needs a closure call
whose result is the record (`cloSigKeyExt` of the lambda) plus the same pick.

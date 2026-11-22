# Fn-tag: a returned parameter callee keeps its set as closures (D17044)

**Lane IR-D1, 2026-11-22, base master `040768a4`.**

`ftMintComplete` (check_fn_tag.vl) admitted a mint fact whose callee is a parameter, without
looking at the parameter's other reads. A parameter its function also returns is typed at the
function's type parameter in the template, so `ftScan` never visits that read, and `ftCtxOk`'s
`RetStmt` arm (`ftRetCarries`) never judged it. The callee took a tag id while its caller held
a closure. `ftReturnedPastSet` adds the one missing fact: a parameter callee that a return value
reads, in a function whose result does not carry the set, refuses the tag. There is no coercion,
and no new admission or route predicate. It narrows an existing admission.

Measurements are in the PR body (fixpoint seeds on both sides).

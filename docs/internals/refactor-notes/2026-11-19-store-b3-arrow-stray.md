# STORE B3.10b, step 0: stray arrow rows (2026-11-19)

This step comes before the per-(call, KeyId) arm: it removes noise that made the arrow facts call a
set open.

## Mechanism
`callFtyPinCstrs` gives a call through a set value (`g(3)`, `const g = if c { inc } else { dbl }`,
or `p(1, 2)`, `const p = fw(add)`) no declared callee (`CSTR_NODECL`), so its solve validates every
body's deferred rows. `arrowRule` records each hole call it meets there as a row of that outer
call. A hole call in an unrelated declaration, such as `ap(f, x) { return f(x) }`, then stands at
open argument types: `x` is unbound at `g(3)`. `arrowFactsBuild` marks the set `afOpen`, and
`ftPlan`'s retry refuses it (`arrowSetOpen`), leaving the set to the late decision.

`arrowRowStray` drops a row whose outer call's callee is a bare name bound to a set (not a declared
function) and whose hole call sits in a named declaration that no member of that set spans. A hole call in a lambda stands. A lambda
written into the set later (`fs.push((g) => ...)`) is not one of the type's members yet. Dropping
those rows too broke `closures/hole-fn-list-capturing-lambda-member-at-handed-result.vl`
(validation in the top-level code). A method call's callee (`xs.map(ap)`) stands too: the method
calls the callback, so a hole call in `ap` is that call's own. A first cut that dropped those
rows built `{inc}`, `{half}` (`hole-fn-list-map-callback-generic-call-loop-alias`) and `{inc6}`
(`hole-fn-list-unbound-and-returned`) as closures. It showed up in the @run A/B as 2 wasm movers
(+112 and +60 bytes, same output).

## Measured (origin/master fixpoint vs this branch's fixpoint)
- Late tag rows: 3 gone, 0 new.
  - `closures/hole-fn-choice-members-differ-in-body` J {dbl}, J {inc}
  - `closures/tagged-fn-through-hole-param-keyed-at-set` P {add}
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B: see the PR.

## Still open on site 9 after this step
- `closures/hole-fn-or-lambda-through-hole-handed-on` 2× T {<lambda>}
- `closures/hole-lambda-inferred-return-in-generic-at-two-pins` N {<lambda>}

These lambda sets need the per-(call, KeyId) arm: `arrowRowFacts` builds a row's facts only for a
set of named members.

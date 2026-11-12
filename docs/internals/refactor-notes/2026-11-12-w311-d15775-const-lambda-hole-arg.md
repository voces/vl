# D15775: a holder handed to a module-scope `const` lambda is a hole argument, 2026-11-12

A record `if` of functions returning different types, bound first and then handed to a named
function's un-annotated parameter, runs because the late tag decision tags the set. The record
then holds i32 ids, and the callee dispatches on them with each member's own signature.
Handed to a `const` lambda instead, the holder's context test (`ftHoldCtxOk`,
`check_fn_tag.vl`) refused the call. Its `ftHoleArg` resolved the callee by `identDeclOf`, which
for a lambda names the `const`, not a function, so the set stayed closures of two signatures. A
`__trap__` probe in a named function per exit of `ftScan` and `ftPlan`, validated by the named
twin, which never trapped, put the refusal at that test. `ftHoleArg` now reaches a module-scope
`const` lambda's parameter through `cwCalleeDeclOf`.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15775 | loud emit reject | runs, `4` |
| the other arm taken | loud emit reject | runs, `1.5` |
| handed twice | loud emit reject | runs |
| a two-parameter lambda, `(n, r) => r.f(n)` | loud emit reject | runs |
| a `let` lambda that is reassigned | loud emit reject | the same |
| a `const` lambda inside a function (D15777, filed) | loud emit reject | the same |

The local case is left out on purpose. Taken the same way, it is tagged and then refused at
emit with another sentence (`a lambda's dispatch arm has no instance built`), while its nested
named twin runs.

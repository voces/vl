# IR: a returned value `if`'s null pad (2026-11-20)

A returned value `if` is legacy's tail `if`: each arm's value is its own exit. Where the result
admits no `null`, nothing falls through and legacy writes `unreachable` after the `end`. The IR
already built that case. Where the result bears a `null`, legacy pads the `end` with the
function's own null (`emitNullForRet`, by `nullRetPlanOf`) and returns it (`emitUnionRetSink`).
The IR refused that pad (`returned if null pad`).

A new right-hand side, `RRetNull`, is that null: a leaf the lowering writes as
`emitNullRetTail(nullRetPlanOf(fn))`, the same plan the fall-off pad already reads. The builder
writes the tail `if`, then `SReturn` of an `RRetNull` temp. That `SReturn` takes the IR's existing
return lowering: the union sink's peephole where it fires, else `return`, as `emitUnionRetSink`
does. The verifier requires `RRetNull` at the function's own return rep, a nullable one or a box.
A function with no null plan is the named miss `returned if null plan`.

Measured at the merge-base in the PR.

Legacy lines deleted: 0. Moved to `@ir`: 0.

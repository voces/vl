# IR: a function value returned at its result's closure type (2026-11-21, lane IR-N2)

`return coercion`'s residue after #9383, split by value rep and result rep (sole-blocker
functions over the corpus files, one-off instrumented build at 568e22a3): closure to closure
152, record to record 42, list to list 27, map 5, others 9.

A function name returned by an un-annotated function (`return same`) is built by `cloValue`. The
function it names is resolved from the node in the current frame, so a per-destination instance
reads its own instance. The value's rep is its node's closure type, which can be a generic
signature or another instance's. The result's rep is the closure type the function returns per
destination. Legacy writes the same closure ref either way. No conversion happens where the
coercion table records none (`fnClo` is a pre-path coercion, still a miss ahead of the return).

## The change

`retCloAt` (`ir_build.vl`) builds a returned function value with no pre-path coercion at the
function's result rep, where that is a closure rep other than the value's. The verifier's
`RMakeClo` rule takes any closure rep. The bytes are legacy's.

tests/cases matched 65121 → 65232 (+111) on one A/B over seeds of 568e22a3, no new fail rows.

Row file `tests/ir-shadow-rows/function-value-returned-at-result-closure.vl`; witness
`tests/cases/closures/function-value-returned-at-its-result-closure.vl`.

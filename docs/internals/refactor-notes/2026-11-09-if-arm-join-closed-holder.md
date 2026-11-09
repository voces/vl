# Step 4: the checker joins a closed fn-holding arm beside an open one at the closed type (2026-11-09)

Lane "fn-value rows 11". Supersedes #6944, which made the same programs run by choosing the
type in mono. Base: master `f75d1327`, built to a fixpoint (6,577,470 bytes). The
candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`g(if c { { f: inc } } else { { f: id1 } })`, `inc` annotated and `id1` not (D15331). The
checker joined the arms at the open arm's type, `{f: (_) => _}`: `holeFnBesideClosedJoin`
(D10797) took the closed side only when both arms were bare function types. So
`elabCallHoleParamTy` answered no closed type for `g`'s `r`, the instance key stayed open, and
no pin delivered `id1` at `(i32) => i32`. Bound to a `const` first (D15304) or listed, the
same `if` refused at the same site. A closed arm that reads a binding
(`if c { o } else { { f: id1 } }`) was a check reject at the same join.

| producer | change |
|---|---|
| `holeFnBesideClosedJoin` (check_relate_core.vl) | also takes the closed side when each side is a record or list type holding a function, and the two are assignable both ways |
| `monoCoerceIfArms` (emit_mono.vl) | an `if` the checker typed closed, at a record or list holding a function, has each open record or list literal arm delivered at that type (`monoElabDeliver`). It chooses no type |

#6944's version decided the type in mono, ahead of the call's pin, so the elaboration had
already keyed `g` open and five instances were demanded late (6 → 11). Here the elaboration
keys `g` at the checker's closed join during `elabRun`, and nothing is demanded late.

## Measured

| | base | candidate |
|---|---|---|
| sweep | SWEEP_BASE | SWEEP_DIFF |
| late demands | 6 | 6 (the fixture: 0; baseline file as master's) |
| seed (fixpoint) | 6,577,470 | 6,577,738 (+268) |
| SEEDSIZE | | |
| rep-fuzz | | REPFUZZ |
| plumb-shape fuel / peak RSS | | PLUMB |

## What stands

Both arms partly open (`{ f: inc, g: id1 }` beside `{ f: id1, g: inc }`) is an emit reject
on base and candidate alike: neither arm is closed, so the join has no closed side to take. A
lambda arm (`{ f: (x) => x * 2 }` beside `{ f: inc }`) is `cannot infer a type for parameter`
on both.

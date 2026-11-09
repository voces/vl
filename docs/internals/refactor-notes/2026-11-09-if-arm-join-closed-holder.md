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
| `monoCoerceIfArms`, `monoCoerceListLitElems` (emit_mono.vl) | an `if` (or a list literal's element) the checker typed closed, at a record or list holding a function, has each open record or list literal arm (or element) built at that type by `monoElabDeliver`. Mono chooses no type |

The list half is needed because the same join types a list literal's elements: without it,
`[{ f: inc7 }, { f: (x: i32): i32 => x * 10 }]` took the closed element type and `inc7` had
no instance (D9950 and two fixtures went `runs → not-runs` in the first candidate's sweep).

#6944's version decided the type in mono, ahead of the call's pin, so the elaboration had
already keyed `g` open and five instances were demanded late (6 → 11). Here the elaboration
keys `g` at the checker's closed join during `elabRun`, and nothing is demanded late.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,754 programs | | 23,751 same, 0 bytes-only, 3 output movers, 0 `runs → not-runs`, 0 new traps |
| the 3 movers | 2 emit rejects, 1 check reject | D15331's and D15304's witnesses and the fixture run |
| late demands | 6 | 6 (the fixture: 0; baseline file as master's) |
| seed (fixpoint) | 6,577,470 | 6,577,820 (+350; +2.8% of the seed-size baseline) |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.4% / −2.5% |
| plumb-shape peak RSS, main / tail | | +0.7% / +0.8% |

## What stands

Both arms partly open (`{ f: inc, g: id1 }` beside `{ f: id1, g: inc }`) is an emit reject
on base and candidate alike: neither arm is closed, so the join has no closed side to take. A
lambda arm (`{ f: (x) => x * 2 }` beside `{ f: inc }`) is `cannot infer a type for parameter`
on both.

# Step 4: a list join binds at the list's element set (2026-11-08)

Lane "function-value open rows", first row. Base: `claude/d15573-forward-join` (#6906) at
`29312c33`, built to a fixpoint (6,573,188 bytes). The candidate is that tree plus this PR, also a
fixpoint.

## What refused, and where

`take(id, id)` beside `take(id, id2)`, where `take` lists `a` and slot-writes `b` (D15574). A probe
on the tag decision showed the late plan of `{id, id2}` failing in its sub-plan for `{id}`, at the
argument `a` of `take(id, id)`: `ftLateParamOk` found no list join (both arguments are `{id}`), and
`mintParamTakes(take, 0, {id})` was false.

That is because every instance of `take` types the calls through `xs[0]` at the checker's element
set `{id, id2}`, the union over all calls (`elabMintFactAt` notes `a` and `b` at it in each
instance). The first instance bound its parameters at `{id}`, which no call through the list reads.

The fix: `fnTagListJoinSet` returns the list literal's element set when it holds every argument's
set. Both calls now bind `take` at `{id, id2}`, as the second already did, and each argument's own
set is decided within it. The same rule makes `take(id2, id)` beside `take(id2, id3)` run.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,741 programs | | 23,738 same, 0 bytes-only, 3 output movers, 0 `runs → not-runs`, 0 new traps |
| the 3 movers | emit reject | run: the D15574 witness, filed in D15574, D1666 and D15483 |
| seed (fixpoint) | 6,573,188 | 6,573,538 (+350) |

## What stands

D15577, filed here: the LITERAL's parameter handed a different generic at each call
(`take(id, id2)` then `take(id3, id2)`) still refuses with the same message, and is the live
emit-reject witness now. Its twin `take(id, id2)` then `take(id3, id)` refuses with
`the tag decision after the elaboration did not settle`, where base gave the D15577 message:
a loud-to-loud move outside the sweep's population, recorded in D15577's ablation.

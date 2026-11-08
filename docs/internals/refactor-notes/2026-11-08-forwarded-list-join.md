# Step 4: a hole parameter forwarded into a list join is bound at the joined set (2026-11-08)

Lane "D15573, and the remaining function-value rows". Base: master `20a7edea`, built to a
fixpoint (6,570,503 bytes); the candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`fwd(f) { take(f, id2) }` with `fwd(id)`, where `take` lists `a` and slot-writes `b`. With the
join taking each argument's type closed at the instance (`fnTagListJoinSet`, `elabSetArgBind`) and
the tag decision following the direct call into the join (`ftParamForwardsSet`), the late decision
for `{id, id2}` and `{id}` passed, and the program still refused.

The refusal came from `elabSetRepRow`'s instance-per-signature arm. It reads `fwd` as handing its
parameter back, because the tail `take(f, id2)` is a call the parameter is handed to, and `id` has
two root instances. So it enqueued `fwd` at `(string) => string` and at `(i32) => i32` beside the
set instance. In those, `take`'s slot write `xs[0] = b` marked `{id2}` partial, and `ftPlan`
refused `{id2}`. A trap in `elabEnqueue` on a `--names` build gave the frame.

The ruling: a parameter forwarded into a join is bound at the joined set, and its calls dispatch by
tag, so those instances are spurious. `elabSetRepRow` builds none for such a parameter
(`elabHoleFwdsListJoin`).

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,740 programs | | 23,737 same, 0 bytes-only, 3 output movers, 0 `runs → not-runs`, 0 new traps |
| the 3 movers | emit reject | run: the D15573 program, filed in D15573, D1666 and D15483 |
| matrix `generic-fn-listed-slot-written-second-generic` | 14 of 46 run | 14 of 46 run, 0 moved, 0 silent |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail | | −1.3% / −2.4% |
| plumb-shape peak RSS, main / tail | | +0.0% / +0.1% |
| seed (fixpoint) | 6,570,503 | 6,573,188 (+2,685; +2.8% of the seed-size baseline) |

The matrix does not move because its `argument` row copies the parameter into a `const` before
handing it on (`const v = a; __hold(v, id2)`). The forward is read only through the parameter
itself, so that spelling still refuses. D15574 (`take(id, id)` beside `take(id, id2)`) is a
different mechanism: no forwarder, and the first call binds `{id}` at itself while the second
joins it. It still refuses, and the live-sites witness moved to it.

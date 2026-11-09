# Step 4: a hole called directly at a type its flow does not take stays unsolved (2026-11-09)

Lane "function-value open rows", D15576. Base: master `894d1d9a`, built to a fixpoint
(6,570,718 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`take(a) { print(run(a, 2)); print(a("ab").length) }` with `take(id)`, where `run<U>(f: (x: U)
=> U, u: U)`. The parameter solve (`solveUnannotParams`) takes the one function type a hole flows
into, `(i32) => i32`. D10382 leaves a hole unsolved only when it flows into two different
function types. A direct call of the hole records no flow, so `a("ab")` was checked against the
solved type.

The probe's hole-callee arm (check_calls.vl) already types each argument of a call through a
hole. It now records them (`holeCallName`, `holeCallArgs`) while the probe runs. The solve leaves
the hole unsolved when a recorded call takes an argument the flow's type does not
(`holeCalledOtherwise`, beside `holeFlowsToTwoFns`). The call then binds the hole per call as
`Fn#id`, as D10382's spelling does. The rows are dropped with the probe.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,746 programs | | 23,744 same, 0 bytes-only, 2 output movers, 0 `runs → not-runs`, 0 new traps |
| the 2 movers | check reject | runs: D15576's witness, and the new fixture |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail | 8,816,740,582 / 6,393,476,672 | +8 / +8 |
| peak RSS of the `vl build`, main / tail (VmHWM) | 322,096 / 321,632 kB | 321,736 / 321,708 kB |
| seed (fixpoint) | 6,570,718 | 6,571,765 (+1,047; +2.7% of the seed-size baseline) |

Outside the sweep, recorded in D15576: the direct call first and then the flow runs too. A
direct call at the flow's type (`a(5)`) still solves. `take(inc)` with `inc(x: i32): i32` still
refuses at the call, because `inc` takes no `string`. An arity mismatch (`a(2, 3)`) refuses with
the same message, now at the call instead of in the body.

## What stands

D15575, the annotated twin `take<A>(a: A)`, is not this mechanism. Both spellings bind the
instance at the untagged set `Fn#id`. The annotated one fails in mono's pin for a parameter its
type parameter annotates, which is in emit_mono's pins. Its row records the trace.

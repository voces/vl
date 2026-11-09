# Step 4: a list join binds at the union of every call's hands (2026-11-09)

Lane "D15577 and the function-value rows". Base: master `92e579e2`, built to a fixpoint
(6,569,048 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`take(id, id2)` then `take(id3, id2)`, where `take` lists `a` and slot-writes `b` (D15577). The
list literal's template type carries the last instance's element set, so call 1 bound `take` at
`{id, id2}` and call 2 at `{id2, id3}`: the union was never tried.

Three producers had to agree on the union `{id, id2, id3}`:

| producer | before | after |
|---|---|---|
| `fnTagListJoinSet` | the literal's element set | the union of what every direct call hands the joined parameters (`fnTagHandsJoinTy`), a caller's parameter read at that caller's calls |
| a root hole-pin row in `elabDrainHoleRows` | keyed at its own pair, e.g. `({id}, {id2})` | keyed at the joined set (`elabHoleRowJoinTys`) |
| mono's late demand for a root call (`elabDemandFrom`) | `elabCallArgSetTy` answered the argument's own tagged singleton `{id}` | it answers the joined set first |

A probe on the drain showed the rows naming both parameters joining at the union; a row naming `a`
alone still returned -1 and builds an instance, which no call demands. A deliberate trap in
`elabEnqueue` on a `--names` build gave the frame of the instance that refused:
`monoWalkIdentCall → monoInstantiate → elabDemand`, at `({id}, {id2})`. Mono's key choice was not
touched: it already reads `elabCallArgSetTy` through `elabCallTaggedArgs`.

Re-keying a row recorded under an instance (`from >= 0`) made D15573's forwarder refuse, three
`runs → not-runs` in the first sweep, so only root rows are re-keyed. The forwarder called with a
different generic each time is D15578, filed here.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,746 programs | | 23,740 same, 3 bytes-only, 3 output movers, 0 `runs → not-runs`, 0 new traps, 1 only in candidate (this PR's fixture) |
| the 3 movers | emit reject | run: the D15577 program, filed in D15577, D1666 and D15483 |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.8% / −2.8% |
| self-compile peak RSS (VmHWM) | 3,954,396 kB | 3,949,144 kB (−0.1%) |
| seed (fixpoint) | 6,569,048 | 6,571,593 (+2,545; +2.7% of the seed-size baseline) |

The live-sites witness for `a generic function taken as a value reaches no call that fixes its
type` moved to D14843's program, which reaches the same literal.

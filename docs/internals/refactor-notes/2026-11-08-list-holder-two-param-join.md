# A list holder slot-written from a second parameter (D15568), 2026-11-08

Measured on master `0cfd71c8` built to its fixpoint, against the candidate built to its fixpoint.

## What changed

`elabListParamSource` keeps a list as one parameter's holder. `xs[0] = b`, a write of a second
parameter, declined it, so the calls through `xs[0]` minted no fact and the generic argument
reached the pin cascade with no closed signature.

* `elabListJoinSource` (check_elab_cap.vl) is the same walk, and it also admits a slot write of
  any parameter of the function.
* `elabListJoinAt` (emit_elab.vl) takes that answer per instance. It is admitted only when every
  parameter read into the list (the literal's elements and each slot write's value) carries one
  set at that instance. `elabCalleeParam` falls back to it after the strict source. The handed-in
  walk takes the literal element and the slot-written read as kept. The call through the element
  then notes the set for each written parameter.

The ungated version (no per-instance test) turns D15453 (`go(same, dbl)`, two different sets)
into check-clean invalid wasm. With the gate, D15453 keeps its seed rule and prints `3 x`.

## Measured

| instrument | base | candidate |
| --- | --- | --- |
| canonical sweep, 23,724 programs | | 4 movers, all `emit_reject -> runs`: D15568 and its three fixtures; 0 runs -> not-runs, 0 new traps |
| `generic-fn-listed-slot-written-second-param` (new) | 0 of 23 un-annotated | 19 of 23 |
| `hole-lambda-listed-slot-written-second-param` (new) | 0 of 23 | 12 of 23 |
| the four listed matrices | 19 / 19 / 12 / 12 | 19 / 19 / 12 / 12 |
| rep-fuzz | exact | exact |
| seed | 6,580,497 | 6,582,787 (+2,290, +2.9% of baseline) |

## What stands

* Two different generics (`take(id, id2)`, D15572): the list's element is `{id, id2}`. Making the
  join admit different sets when each parameter is read only into the list is not enough. The
  elaboration notes the facts, but the argument still reaches `monoArgTyNameCascade`'s refusal,
  because the tag decision does not type either parameter at the wider set. That is the step-4
  join.
* Three parameters, `take(id, id, id)` beside `take(id, id, id2)`, run under the candidate: the
  second instance declines the join and falls to the path it took before.

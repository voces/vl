# A list holder bound to two different generics (D15572), 2026-11-08

Measured on master `0cfd71c8` with #6887 merged, built to its fixpoint, against the candidate built
to its fixpoint.

## What changed

D15568's close takes `take(a, b)` with `const xs = [a]; xs[0] = b` as a holder of both parameters
only when the instance binds them to one set. `take(id, id2)` binds `a` to `{id}` and `b` to
`{id2}`, so no call through `xs[0]` noted a fact. The tag decision then asked whether `a` takes
`{id}`, and the argument reached `monoArgTyNameCascade`'s refusal. Per the step-4 rulings, the
list's element is the joined set `{id, id2}`, and both parameters are typed at it.

* `fnTagListJoinSet(f, i, args)` (check_elab_cap.vl) is the list twin of `fnTagSharedJoinSet`.
  For an un-annotated parameter `i` that a list binding of `f`'s body joins with other parameters
  (`elabListJoinSource` and its slot writes), it returns the union of the sets `args` hands them.
  It returns -1 when they hand one set, which leaves D15568's path as it was.
* The elaboration (`elabSetArgBind`, emit_elab.vl) binds each joined hole at that set and notes
  the call's join (`fnTagCallJoinNote`), as it does for a shared type parameter.
* The tag decision (`ftLateParamOk`, check_fn_tag.vl) reads it. An argument of set `{id}` lands
  in a parameter that takes `{id, id2}`, so the two are decided together.
* `elabListJoinAt` admits reads of different sets when each lies within the list's element set
  at the instance. The elaboration still keys an instance at the unjoined binding. Without this,
  that instance's reads made `{id}` partial, and the decision refused it.

`monoArgTyNameCascade` needed no change. The argument is now a tagged id, and the pin reads the
instance's binding before the cascade is reached.

## Measured

| instrument | base | candidate |
| --- | --- | --- |
| canonical sweep, 23,724 programs (23,730 with the new rows and fixtures) | | 1 output mover, D15572 `emit_reject -> runs`; 0 runs -> not-runs, 0 new traps, 0 new silent; 2 bytes-only movers, each byte-identical when built alone |
| `generic-fn-listed-slot-written-second-generic` (new) | 0 of 23 un-annotated | 14 of 23 |
| `hole-lambda-listed-slot-written-second-generic` (new) | 0 of 23 | 12 of 23 |
| the four listed matrices | 19 / 19 / 12 / 12 | 19 / 19 / 12 / 12 |
| the two second-parameter matrices | 19 / 12 | 19 / 12 |
| D15453, D15010, D15567, D15568 | runs | runs |
| seed | 6,582,807 | 6,584,641 (+1,834) |

## What stands

* D15573: the first generic handed on through a hole parameter (`fwd(f) { take(f, id2) }`).
  `f`'s set is known only at `fwd`'s instance, and the call's join reads template types. The
  matrix's `argument`, `struct_field_init`, `array_element`, `map_value` and `map_set` rows are
  this shape. It now carries the witness places D15572 held: the live-sites row and its probe,
  the emit-stage case in `vl_check_json_test.ts`, D1666 and D15483.
* D15574: `take(id, id)` beside `take(id, id2)` in one program. Each runs alone. Together, `{id}`
  is held at its own rep in one instance and within the joined set in the other. Refused before
  and after.
* Three parameters, `take(id, id2, id3)`, refuse before and after.

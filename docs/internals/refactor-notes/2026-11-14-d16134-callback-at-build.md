# D16134: a list callback's instance keyed by its receiver's build — D16133's ruling, stage 1

**Change.** The elaboration produces the late fact; mono reads it; the check's floor narrows.
- `emit_elab.vl`: `elabCbAtBuild` enqueues a `map`/`filter` callback (a lambda, or a named hole
  function) with a `#r.0` entry at the receiver's element build, D15173's delivered-row key.
  A lambda inside an open declaration is keyed under each of that declaration's instances
  (`elabCbOpenCalls`, read in `elabOneAt`). `elabSameSlotsAtBuild` stamps a `filter`/`slice`
  call with the list of the build, since the result holds the receiver's elements.
  `elabListElemBuild` is the one answer for a receiver's element build: a binding's build
  (`recBuildTable`), a stamped call, else `recArgBuiltTyIn`.
- `emit_mono.vl`: the lambda and named-callback arms of `monoCoerceListCbArg` read
  `elabCbParamRowTy` in place. No decision, and no new function: the pin-helper count stays 908.
- `emit_classify.vl`: `mfResultSlotOf` reads the call's stamp before its type.
- `check_fit_rules.vl`: `recBuiltCallbackRefuse` skips a callback `recCbTakesBuild` accepts.

**Why not the check.** The WIP on `i-d16134-filter-built-callback` typed the callback at the build
in `memberCallMapFilterTy`, option (i); the build table is empty there. The elaboration runs
after the post-pass, so the fact is decided before it is read, with no extra pass.

**Measured.** `callback-over-built-list.matrix.vl` (new, 25 cells, both faces), master `293074baf`
fixpoint against this branch's fixpoint: 0 runs → not-runs, 0 silent. 18 un-annotated cells move
to runs, 15 from the check's floor, one from an emit reject and two from check-clean invalid wasm
(D16212); two annotated cells move to runs, one of them from check-clean invalid wasm.
`kept-maker-delivery-null-field.matrix.vl`: `filter_lambda` un-annotated moves to runs, nothing
else moves. Guest fuel on `plumb-shape-cost.vl`, this branch against master `293074baf`: main
9,394,793,146 against 9,390,001,365 and tail 6,801,876,885 against 6,798,577,568, both +0.05%.
The check's +3.6% (tail) and +4.7% (main) are master's against a stale baseline.

**Size.** +164 net compiler lines (4 files); pin-helper delta 0.

**Left.** D16210 (a field receiver) and D16211 (the floor: a parameter annotated at the element
type, a `map` result holding the record). Stage 2 is D16137.

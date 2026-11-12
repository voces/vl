# step7 inst: D15752 — an uncalled map slot closes at its delivery, not the default

Lane w321, D15752. A map binding of un-annotated functions that nothing calls directly
(`fnMap.set("a", inc0)`), pushed onto `({[string]: (a: f64) => f64})[]` or set into a map of such
maps, was refused at emit: `monoPinMapValues: the map's stored functions close at another type
than its slot fact`.

## Mechanism (probed)

`elabSlotClose`'s map arm closes the binding's value type through `elabHeldClosedTyAt` →
`elabHeldFnTy`. With no call reaching the set, `elabHeldFnTy` returned the D9100 default
(`elabHoleFnClosed`), `(i32) => i32`. A probe at that arm on the witness printed
`v=(i32) => i32 dlv=(f64) => f64`: the slot's own deliveries (`elabSlotDeliveries`, which since
#7459 include the push and `set` rung `elabPushedOnto`) already named `(f64) => f64`, and mono pins
the stored functions there, so the two disagreed. The same map bound directly at the annotation
gave `v=(f64) => f64` and ran.

## Change

`elabHeldFnTy`, before the default: `elabHeldDeliveredFnTy` returns the one closed signature every
delivery of slot `path` of the holder agrees on, when each member of the set is a top-level function
whose result at those parameters is that signature's result. Disagreeing deliveries, an open one,
or a member answering another result give -1 (no fact), never the default. No delivery leaves the
default as it was.

## Grading

- D15752's witness: refusal → runs, prints `7`. The `set` spelling (grading list): refusal → runs.
- `map-of-hole-fns-read-by-keys.matrix.vl`, before `master 377a45c9b` / after: `array_push`
  (both faces) and `map_set` (annotated) refusal → runs; runs → not-runs 0, → silent 0.
- The 81 hole-function matrices under `scripts/capability-probes/matrix/` (names matching
  `hole-fn|fn-list|of-fns|fns-|uncalled`), same two seeds: runs → not-runs 0, no new SILENT cell
  (every SILENT cell is SILENT on both seeds), 8 cells refusal → runs (`push_bound_map` both faces,
  and `array_push` both faces and `map_set` annotated in two map matrices).
- `distilled/regress.vl`: no runs lost. The corpus movers are CI's sweep `diff` (PR body).
- D15754 (one function in two maps, one map unread) still refuses with the same message on both
  seeds: its set is called through `g`, so the new rung is not reached. Its mechanism is not this one.
- Fixture `tests/cases/maps/hole-fn-map-binding-delivered-into-annotated-holder.vl` (push, `set`,
  a float-result function).

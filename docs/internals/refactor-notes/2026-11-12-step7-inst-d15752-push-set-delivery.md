# Step 7 inst: a binding pushed or set into an annotated holder is delivered at its element, 2026-11-12

Lane w321, D15752. Take `const inner = [inc0]`, with `inc0` un-annotated, pushed onto
`const xs: ((a: f64) => f64)[][] = []` and called as `xs[0][0](6)`. The program loaded and then
trapped: `indirect call type mismatch`. The same binding written as `xs[0] = inner` ran.

The probes agreed for the push and the index write in the checker (`fvaAdapt`, `fvaValueRowWalk`,
`recordRepTyAdopt`) and in the elaboration's drained rows. They split in mono:
`monoPinListElems` found no pin for `inner`'s element slot (`monoDeclPathKeys`), and
`elabSlotUncalledOmitting` held. So the literal was built by `monoUncalledListElems`, as the empty
closure row `(()=>void)` with an empty `inc0` instance. The pins come from `elabSlotDeliveries`,
whose climb reads a read's delivery stamps only where `elabWrittenDest` holds. An index store's
alias reaches the annotated `xs`. A push argument is an argument of no declared function
(`elabGivenTo` answers -1), so its stamp, the annotated element, was dropped.

## Changed

`elabWrittenDest` (`emit_elab.vl`) takes a read given to an annotated holder through
`elabPushedOnto`: an argument of `xs.push(r)`, or the value argument of `m.set(k, r)`, on a binding
whose annotation is written. Coordinated with w318, whose emit_elab functions are elsewhere.

## Measured

`scripts/capability-probes/matrix/bound-container-of-hole-fn-pushed-onto-annotated-list.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 58 graded | 44 | 55 |
| program traps | 13 | 0 |
| silent | 3 | 1 |
| `runs → not-runs` | — | 0 |

- Twelve cells went from trap to runs. They are the `push_bound_list*` cells and `array_push`,
  both faces each, and `map_set`, annotated.
- `push_bound_map`, both faces, went from invalid wasm to a loud `monoPinMapValues` refusal. The
  map's stored functions are now pinned at the pushed delivery, while the elaboration's slot fact
  (`elabSlotFacts`) still closes the map at the default. That is D15752's own witness, re-graded
  to clause 2 and still open; D15754 is the same refusal.
- The SILENT cell left is `return_inferred`, annotated, the same on master. A function's returned
  binding bound at the annotation; filed as D15755, clause 1.

## Proof

**Full local sweep.** Fixpoint seeds, base master `6cb5dd90`, 24,006 programs:

| | count |
| --- | --- |
| same | 24,005 |
| bytes-only | 0 |
| output movers | 1 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The one mover is D15752's witness, which goes from check-clean invalid wasm to a loud emit reject.

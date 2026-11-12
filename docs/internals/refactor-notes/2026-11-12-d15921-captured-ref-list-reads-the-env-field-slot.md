# D15921: a captured ref list reads the slot its env field is typed at, 2026-11-12

This closes D15921, a clause-2 loud emit reject (`field access receiver is not a struct`), the
orchestrator's item after D15922.

## Mechanism

A list of records whose function field holds functions of different results has the type
`{f: (_) => _}[]`, which keys no ref-list row. The frame's local holds the row the list was built
at. Probes on the read `c[1].f` showed:

- In the frame, `refListSlotOfExpr(c)` answers slot 0 through the local (`declaredRefArraySlot`).
- In a closure capturing `c`, it answers -1 in every frame, and the element has no struct row.
- The calls themselves are noted as tagged-set calls with both arms, so the dispatch was never
  the problem. Reading the callee value was.

`capturedRefListSlot` (`emit_classify.vl`) re-derived the capture's slot from the parent
binding's type alone. The env field is typed from the local's own slot (`captureValStructIdx`,
through `letCellSlot`).

## What changed

`capturedRefListSlot` falls back to that env-field slot (`capturedCompanionSlot`), gated on the
capture's kind being a ref list, when the type keys no row. Where the type answers, nothing moves.

## Witnesses

`tests/cases/closures/frame-list-of-fn-records-of-different-results-captured-by-closure.vl`
covers:

- the witness;
- a nested closure;
- a reassigned `let`;
- a loop over the capture;
- a returned closure;
- an element bound inside the closure.

On master the loop and the bound element failed with `a ref list's element row does not
resolve`, and the rest with the row's message.

## Measurement

This can move output, so the sweep is CI's under the `sweep` label, per the 2026-11-12 process.

# Slot store part D, the flip: mono's slot questions read the place classes (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md); design in `2026-11-16-slot-store-pin-table-design.md`. Mono's
delivery readers move off the delivery walk onto the place classes, and the classes are built once
at elab end. The walk's remaining callers move in D2, and part E deletes it.

## Readers switched

`monoDeclPathKeysIn`, `monoSlotDeliveryTy`, `monoPinFnParamTys`, `monoFlowSlotPins`, and the
per-instance and annotated-result questions read `eplSlotDeliveredTys`, `eplSlotAnnRets` and
`eplSlotPerInstance`. A lambda's delivered numeric result (`elabLamDeliveredRet`) reads the classes'
call types.

## When the classes are built

At elab end (`elabSlotBundleFacts`), before any rewrite, for a program that takes a function as a
value (a lambda, or a named function read anywhere but as a callee). Mono rewrites rename callees in
place (`h(…)` to `app2(…)`), and classes built at mono's first question saw the renamed tree. A
program that takes no function value has nothing to deliver, and builds the classes only if a reader
asks.

## Engine rules (D-only, landing here)

- A slot is asked per instance when its delivered types differ between instances, or when it holds a
  function declared in the instanced function around it (each instance holds its own copy).
- A binding's own closed function type is a delivery; a literal's is not.
- An instance's clone of a capture write temp answers as the cell's binding (parity 3, #8634); a
  value the check left open takes its instance's type at its edge (parity 4, #8652).

## Cost cuts

The eager build first measured L2 self-compile fuel +49% and ran L2 out of GC heap at 4G.

| cut | L2 fuel on master's compiler source |
|---|---|
| a merged class drops its lists (#8674) | completes; peak live set 1,268 MiB |
| a value whose closed type holds no function draws no union | +49% to +7.0% |
| a node nothing consumes, or a value holding no function, draws no edge | −0.7G |
| a type's inertness asked once per build | +7.0% to +1.9% |
| eager only where a function is a value | plumb-shape +2.3% to +0.5% |

## Movers

- `closures/fn-record-returned-to-two-bindings-one-written`: the classes share a non-generic
  function's returned record between its call sites (ruled a graded mover; pin D16801).
- `closures/generic-returned-fn-param` closes with the eager build: a timing artefact of building at
  mono's first question.

## Readings

READINGS

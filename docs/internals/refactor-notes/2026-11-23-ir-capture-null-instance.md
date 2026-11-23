# IR capture: a generic's `null` instance (2026-11-23)

Lane IR-N8. A generic instance at `U = null` capturing its parameter missed
`closure env capture`. `capRepFor` compared legacy's capture valtype only against a scalar
valtype or a `ref`/`ref null` heap type, while legacy writes `nullref` (0x71) for a `null`
capture. With that accepted, the instance's lambda then missed `read of x`: legacy reads
the capture on its `nulnone` arm and writes the destination's null without touching the
environment, which the IR already lowers for a `null` unit local (`{ nuAt, nuOwn }`).
`captureRead` takes the same arm.

Witness: `tests/ir-shadow-rows/capture-null-instance.vl`.

## Remaining `closure env capture` misses in the census family's programs

A throwaway probe build over the family's tests/cases programs puts every remaining miss on
`parentBindingOf` answering -1: a captured loop variable that the IR did not build, or a
capture forwarded through a sibling nested function (`sibling-capture-beside-shadowing-param`,
`closure-capture-shadows-module-block`, `capturing-nested-function-read-from-another-frame-equality`).
That is a separate mechanism, so this note leaves it as its own family.

# IR: a lifted callee's environment captures from an un-lifted frame (lane COV-CLOS, 2026-11-26)

`liftCaps` passes each capture a lifted nested callee takes. A capture this frame holds in its
environment (the frame is a closure that was not lifted, e.g. one bound in a module-scope block)
missed `callee captures env`, since the call's null environment is written ahead of the captures.
The capture is now read from the environment into a temp at the rep the callee takes it at; the
read has no effect, so its order against the null environment does not matter. A capture whose
rep differs from the callee's, or that lives in a cell, still misses.

## Measurements

Q58 position sweep (`tests/cases/closures/nested-closure-captures-module-block-local-positions.vl`:
return, call argument, record field, list element, two captures at two reps): base 4 functions
miss `callee captures env`, head 0; output identical (`7 5 hi 2.5 11`) claims-off and on.

RIPPLE_PLACEHOLDER

CENSUS_PLACEHOLDER

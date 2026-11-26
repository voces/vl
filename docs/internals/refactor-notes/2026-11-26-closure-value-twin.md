# IR: a function value coerced to `void` is its void twin (lane COV-CLOS, 2026-11-26)

A named function `(P…) => T` read where `(P…) => void` is expected is written by legacy as its
void twin's closure (`fnValueArmOf`'s `twin`, `synthVoidTwins`). The IR's `cloValueFeOf` took no
function for that arm, so the read missed `closure value twin`. It now closes over the twin
(`voidTwinForNode`). The twin's own closure rep is the destination's, not the name's checked
type's, so a global's initializer (`cloInit`) and a delivery (`deliver`) take it through
`instanceAt`, as a hole function's instance is taken, typed at the destination's type.

## Measurements

MEASUREMENTS_PLACEHOLDER

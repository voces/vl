# IR: a function value coerced to `void` is its void twin (lane COV-CLOS, 2026-11-26)

A named function `(P…) => T` read where `(P…) => void` is expected is written by legacy as its
void twin's closure (`fnValueArmOf`'s `twin`, `synthVoidTwins`). The IR's `cloValueFeOf` took no
function for that arm, so the read missed `closure value twin`. It now closes over the twin
(`voidTwinForNode`). The twin's own closure rep is the destination's, not the name's checked
type's, so a global's initializer (`cloInit`) and a delivery (`deliver`) take it through
`instanceAt`, as a hole function's instance is taken, typed at the destination's type.

## Measurements

I8 census over the `tests/cases` programs (base and head at master `02deb40f1`): `closure value twin`
5 → 0 unclaimed (3 functions, 2 start bodies). Claimed functions 97,474 → 97,477, claimed starts
8,397 → 8,399, unclaimed 482 → 477; 0 claimed functions or starts lost, no other class moved.

Claims-off ripple (`VL_IR_SHADOW=1`, every `tests/cases` program): 0 of 8,190 built programs
differ in bytes; 1,447 fail to build on both seeds (expected-error cases).

Q58 position sweep (`tests/cases/functions/void-twin-value-positions.vl`: a call argument, a module
binding, a local binding, a record field, a list element, a function result, a reassigned let, a
map value): base 2 functions and the start miss `closure value twin`; head all claimed, output
identical claims-off and on.

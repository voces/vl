# IR: a generic function's alias binding is its core closure (lane COV-CLOS, 2026-11-26)

`const x = inner` of a nested function with an un-annotated parameter, used only as a callee,
is stored by legacy as the function's core closure (`letStoresGenericAliasCore`,
`emitClosureValueCore`): no generic-value refusal, since `monomorphize` rewrote each `x(args)`.
The IR already noted that initializer (`ibAliasRhs`) to keep legacy's refusal unraised, but
still built the read on the checked arm, whose `closureValueWhy` refuses a generic function, so
the binding missed `closure value refused`. `cloValue` now takes the core arm for it.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `e71640fbf`): `closure value refused` 7 → 0 unclaimed functions (`aliasNum` of
`nested-hole-fn-namesakes.vl`, and the position test's six). Claimed functions 97,691 → 97,698,
claimed starts 8,409 → 8,409; 0 claimed functions or starts lost, no other class moved.

Claims-off ripple (`VL_IR_SHADOW=1`, every `tests/cases` program): 0 of 8,198 built programs
differ in bytes; 1,447 fail to build on both seeds (expected-error cases).

Q58 position sweep (`tests/cases/functions/generic-alias-core-positions.vl`: called once, twice,
over a capture, two defaulted parameters, in a loop, inside a lambda): base 6 functions miss,
head 0; output identical claims-off and on.

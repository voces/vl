# IR: a generic function's alias binding is its core closure (lane COV-CLOS, 2026-11-26)

`const x = inner` of a nested function with an un-annotated parameter, used only as a callee,
is stored by legacy as the function's core closure (`letStoresGenericAliasCore`,
`emitClosureValueCore`): no generic-value refusal, since `monomorphize` rewrote each `x(args)`.
The IR already noted that initializer (`ibAliasRhs`) to keep legacy's refusal unraised, but
still built the read on the checked arm, whose `closureValueWhy` refuses a generic function, so
the binding missed `closure value refused`. `cloValue` now takes the core arm for it.

## Measurements

MEASUREMENTS_PLACEHOLDER

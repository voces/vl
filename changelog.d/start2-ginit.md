## Codegen, memory & runtime (Track B)

- **IR builds a start-body list literal at its binding's storage row:** a module list literal initialized in the start body whose binding stores a wider record's list (`letBindTy`) is built at that row, as a constant-expression one already was. `soundness/record-nested-list-binding-delivered-wider-runs.vl` is fully claimed (1 of `global initializer coercion`'s 9 units). The other 8 are a map → map retag at the global store, routed to the converter (COV-CALL). Claimed and claims-off builds are byte-identical.

## Codegen, memory & runtime (Track B)

- **IR coverage: a null test of a union box or a scalar map read.** `x == null`/`x != null` over a `U | null` box reads its null tag through legacy's shared `nulTestBoxTagTail`; `m[k] == null` over a scalar-valued map read is the map's has probe (`RMapHas`), negated for `==`, as `emitMapHas` writes it. The self-compile's `null test boxTag` (8) and `null test mapHas` (7) blocker rows fall to 0.

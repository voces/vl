## Codegen, memory & runtime (Track B)

- **IR claims a `string` global narrowed to a literal set, and an empty list stored into a list cell:** the global reads as the string its cell holds (as a local does), and `[]` is built at its cell's list rather than at a record type no row holds. `global read coercion` falls on `std/array-litunion-remedies.vl`; `global store coercion` falls 3 → 0 (D17076 is fully claimed; the two d16132 cells move on to `box field of a let list's element`, which their local spelling misses too). Claimed and claims-off builds are byte-identical on every witness.

## Codegen, memory & runtime (Track B)

- **Fixed D17124** (clause 1): a value `if` joining a `null`-typed binding (`const n = null`) with a record, delivered as `T | null`, was invalid wasm when the binding was the then arm. The join now takes the record arm's kind and row. Filed **D17130**, the root: the join's type is left `_ | null`, so reads of the join's own type see its record arm as null.

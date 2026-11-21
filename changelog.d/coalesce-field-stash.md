## Codegen, memory & runtime (Track B)

- **D17036 closed:** `f().k ?? "a"` over a `K | null` field, and `f().b ?? false` over a `boolean | null` one, evaluate the receiver once. A `??` whose operand is a field read of a receiver that is no re-readable place is stashed once, as a call or `if` operand already was (`coalLhsStashes`, shared by the stash-slot scan and the niche arms).

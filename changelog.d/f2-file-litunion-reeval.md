## Codegen, memory & runtime (Track B)

- **Filed D17036 (clause 1):** `f().k ?? "a"` over a `K | null` field writes its operand twice, so an effectful receiver runs again when the field is present (`calls` counts 2).

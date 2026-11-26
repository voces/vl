## Codegen, memory & runtime (Track B)

- **IR builder:** a `?.` chain an instance folds to `null` (its receiver bound to `null`) is boxed as the destination's null, so the null-receiver instance builds on the IR.

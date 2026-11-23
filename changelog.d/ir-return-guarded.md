## Codegen, memory & runtime (Track B)

- **IR lowers guarded global reads, and returns a value stored at its result's valtype** (`guarded global read`, `return coercion`).
  - A read of a global that may run before its initialiser is now the IR's: the lowering writes legacy's read-before-init guard (`emitInitGuard`), then the read.
  - A returned closure stored at the result's valtype (`repStoresAs`), or a `null` that fits the nullable result's ref, is returned as it stands, the rules an argument already follows. The verifier's return rule accepts the same pairs, noted by the facts pass.
  - A read of a never-filled null-unit global folds to its destination's null, as a local's read already did.

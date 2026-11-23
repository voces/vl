## Codegen, memory & runtime (Track B)

- **IR lowers guarded global reads, and returns a value stored at its result's valtype** (`guarded global read`, `return coercion`).
  - A read of a global that may run before its initialiser is now the IR's: the lowering writes legacy's read-before-init guard (`emitInitGuard`), then the read.
  - A returned closure stored at the result's valtype (`repStoresAs`) is returned as it stands, the rule an argument already follows; the verifier's return rule accepts the same pair, noted by the facts pass.

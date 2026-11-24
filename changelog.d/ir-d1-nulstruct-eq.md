## Codegen, memory & runtime (Track B)

- **IR compares two nullable records as legacy does** (capability probe `optchain-result-struct-equality`'s mechanism). `S | null == S | null` stages both sides once, answers `false` where exactly one is null and `true` where both are, then compares the fields, nested nullable records included. Byte-identical; legacy's row choice and guard are shared, moved unchanged. A bare record beside a nullable one, a list element operand and a `?.` operand stay named misses.

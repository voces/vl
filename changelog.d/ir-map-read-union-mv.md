## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable-scalar map value read under `??`.** `m[k] ?? d` over a `{[string]: f64 | null}` map missed at `map read mv`. Legacy stashes the stored or null box, tests its null tag, and writes the default or the unboxed scalar. That arm is now a plan and three writers legacy and the IR share. The IR builds the read at a new inline form (3).

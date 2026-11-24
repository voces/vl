## Codegen, memory & runtime (Track B)

- **IR coverage, a scalar map read under `??` joining another arm of its union:** `m[k] ?? true` over an `i32` map is built by the IR, as legacy writes it: the hit boxed at the scalar's arm, the default at its own. A union join's arm that is itself a `??` chain is no longer a named miss.

## Codegen, memory & runtime (Track B)

- **D17103, D17112 closed:** a narrowed read of a nullable map value or global now runs, at a binding, a field read, a concat, an interpolation, an argument, `is`, `==` and a loop, when its record type is stored on a declared record's union-arm row. The read recovers its non-null ref and names the row its cell stores. Before, the binding was invalid wasm and the field read was refused. `==` of two records of a declared type that is also a union arm, at a nullable scalar field, no longer traps the compiler. Neighbours filed: D17113, D17114.

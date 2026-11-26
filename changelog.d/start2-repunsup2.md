## Codegen, memory & runtime (Track B)

- **IR claims a `Map()` whose key and value types come from its destination:** a union arm's `{[i32]: i32} | null` field, an annotated binding, an argument or a return. It is built at the destination's map and widened to a nullable one. `rep unsup of call` falls 1 → 0 on its program.

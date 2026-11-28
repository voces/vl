## Codegen, memory & runtime (Track B)

- **IR claims a call of a function-valued field named `map` or `filter`:** the method dispatch takes the list arm only over a list receiver (`mfRecvKindOf`), as legacy's does, so `s.map(1)` over `{ map: (i32) => i32 }` is the field's call.

## Codegen, memory & runtime (Track B)

- **List literals, one widened-scalar arm:** the f32, f64 and i64 list-literal arms were three
  copies of one builder, and are now one (`emitArrWide`). A closed plan per arm names the
  element form, the backing and wrapper types, the widening kind and the chunk name. Every arm
  asks the `for`-iterable hoist the same way. No emitted byte moves.

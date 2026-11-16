## Codegen, memory & runtime (Track B)

- **IR shadow, a negated float literal:** the IR lowering writes `-1.5` as one constant with its
  sign bit flipped, as legacy does, rather than the constant then `f64.neg`. This clears the one
  dual-emit mismatch on master (`isFiniteF64` in `std:json`). No emitted byte moves.

## Infrastructure (Track F)

- **The oracle checks `u8`'s domain on a constant cast.** `300 as? u8` is `null`, and a radix
  constant is checked at its 32-bit pattern (E8.3). `u16`, `u32`, `i8` and `i16` are no cast
  target (T1.1, T1.3). A bare `as` that fails at module scope is a refusal, not an oracle crash
  (E8.2). The oracle now prints T's `cast-join-bounded-tails.vl` fixture as it expects.

## Codegen, memory & runtime (Track B)

- **IR null test, follow-up:** the IR's null-test lowering names the three arms the builder
  admits and misses on the rest, and legacy's map null test fails with a sentence where it fell
  through with no lowering. No emitted byte moves.

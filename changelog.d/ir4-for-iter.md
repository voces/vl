## Codegen, memory & runtime (Track B)

- **IR coverage, `for` over a list literal:** when a `for` walks a list literal of constants, the
  IR now reads the same hoisted module list that legacy reads, instead of missing. Legacy and the
  IR now make that decision the same way, from the loop's shape, not from a flag set while the
  loop is emitted. No emitted byte moves.

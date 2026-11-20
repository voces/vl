## Codegen, memory & runtime (Track B)

- **IR coverage, literal-union list literals:** a list literal whose elements are literal-union
  atoms now takes the short build in the IR, as it does in legacy. The IR's long-literal miss now
  names its reason: `long`, `for iterable` or `null sentinel`. The unused `arrLitShort` is gone. No
  emitted byte moves.

## Codegen, memory & runtime (Track B)

- **IR shadow, distilled corpus clean:** the IR builder leaves a function with an open-typed
  parameter or local uncovered, rather than handing the verifier an open type. Float `%` lowers
  through the shared `__f64_rem__` call. An instance's template-declared local maps to one variable per
  wasm local. `ir-shadow.vl` reads 12,259 of 12,259 covered functions matched, with no mismatch class.
  Nothing is claimed, so no emitted byte moves.

## Codegen, memory & runtime (Track B)

- **D16880:** a union list joined with, or spread beside, one whose numeric member the other holds
  only widened runs: `(string | f64)[] + (string | i32)[]` rebuilds each `i32` box as an `f64` one.

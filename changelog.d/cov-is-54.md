## Codegen, memory & runtime (Track B)

- The IR boxes an assignment's value into a union at a wide number arm (`i64 | null`, `f64 | null`,
  `f32 | string`) at that arm's width, a hex literal's 64-bit pattern included, as legacy did.

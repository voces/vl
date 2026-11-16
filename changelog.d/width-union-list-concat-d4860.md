## Codegen, memory & runtime (Track B)

- **D4860:** a union list concatenated with, or spread beside, a list of a narrower union runs:
  `a + b` and `[...a, ...b]` for `a: (string | i32 | f64)[]`, `b: (string | i32)[]`. The narrower
  list's boxes are already boxes of the wider union, so it joins the wider row without a copy.

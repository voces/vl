## Codegen, memory & runtime (Track B)

- **IR claims an `f64` literal assignment boxed into a numeric union** (`show(b = 2.5)` with `show(a: i64 | f64 | i32)`), which legacy's box ladder writes. It is boxed on the target's own plan after the store, in every delivery position.

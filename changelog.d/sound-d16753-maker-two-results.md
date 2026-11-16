## Type system (Track A)

- **D16753 closed**: a maker returning a hole lambda, delivered at `(a: i32) => i32` and at `(a: i32) => f64`, built one `i32`-returning closure for both, so the `f64` call trapped (`indirect call type mismatch`). The maker's wide twin returns a lambda at the twin's result, so each delivered result has its own closure; the witness prints `4` and `0.5`.

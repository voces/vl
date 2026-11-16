## Type system (Track A)

- **D16752 closed**: a hole lambda returned by an inferred-return function and stored into a map of `(a: i32) => f64` kept its `i32` result, so the call through the map's value trapped (`indirect call type mismatch`). The call search that decides such a lambda's result now follows `m[k] = v` and `m.set(k, v)` to the map's reads, as it followed a push; the witness prints `0.5`.

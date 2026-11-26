## Codegen, memory & runtime (Track B)

- **IR builds a widened map read and a scalar join's computed default (lane COV-UNION):** `m[k] ?? 0.5` over an `i32` (or `f32`) map, whose hit is widened to the `??`'s number, goes by the IR along legacy's `widen` arm. A default a call computes over a scalar map, joined with the value into a box (`m[k] ?? half()`) or a boxed `T | null` (`m[k] ?? maybe(n)`), is the fused read's miss arm.

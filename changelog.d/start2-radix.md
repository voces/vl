## Codegen, memory & runtime (Track B)

- **IR claims a hex assignment value read at its wide cell's width:** where the use is the cell's `i64` or `f64`, the value is the cell's own read (or that read converted), as legacy writes it. `widen radix` falls 8 → 0 units on `literals/hex-width-through-assignment-value.vl`, whose output is unchanged and whose claimed and claims-off builds are byte-identical. `nullableTail` there misses `box ladder`.

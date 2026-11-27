## Codegen, memory & runtime (Track B)

- **IR compares a bare `i64`, `f64` or `f32` map read, and one against a call (lane COV-UNION):** `ml["a"] == big()`, `mf[k] != 0.0` go by the probe's compare at the map's own kind, a miss equal to no value.

## Codegen, memory & runtime (Track B)

- **IR: a scalar map read with a nullable default is boxed into `T | null`**: `map read scalarBox` 2 → 0 programs in regen-10, the D2254 witness claimed under `VL_IR_REQUIRE_CLAIM=1` (refactor-notes/2026-11-26-ir-map-read-scalar-box.md).

## Codegen, memory & runtime (Track B)

- **`is` over a field of a record stored at a wider record's row tests the field's own member** (`o.v is f32` where `o = { v: x }`, `x: i32 | f32`, was stored as a `{ v: i64 | f64 }`): it read the stored box's widened tag and answered `false`.

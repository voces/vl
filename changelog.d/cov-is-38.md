## Codegen, memory & runtime (Track B)

- **IR claims `filled` at a union element type** (`filled(2, v)` with `v: i32 | string`, `f32 | null`, a numeric join or a record union): the fill is delivered at the element's own union, where it read as a box into another union.

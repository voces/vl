## Codegen, memory & runtime (Track B)

- The shape-row walks in `emit_shape_rows.vl` (recursion test, tagged-set list spelling, function and literal mentions, nested nullable element names) visit each type once instead of stopping at a fixed depth or size; `emit_shape_rows.vl` holds no walk limit.

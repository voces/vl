## Codegen, memory & runtime (Track B)

- **IR coverage: `for k, v in m` over a map whose value is not an `i32` or a `string`.** Floats, booleans, records, lists, closures and union boxes are all covered. Legacy's walk writes the value into the pair slot, and the IR binds the second name to that slot at the value type's rep; before, the builder admitted only an `i32` or a `string` there. No legacy bytes moved.

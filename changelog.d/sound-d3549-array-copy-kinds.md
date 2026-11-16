## Codegen, memory & runtime (Track B)

- **D3549 closed:** `__array_copy__` copies a list of any element type with one `array.copy`, as `.slice` does. That covers strings, records, `i64`, `f32`, lists, nullable strings, unions, maps, closures and bytes. Before, emit refused every list kind except `i32`, `boolean` and `f64`. This unblocks a pure-VL `slice` in `std:array`.

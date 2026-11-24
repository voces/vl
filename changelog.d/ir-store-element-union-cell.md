## Codegen, memory & runtime (Track B)

- **IR coverage:** a closure's write to a shared `let` with no initializer (an `i32`, `f64` or `v128` held in a `T | null` cell) boxes the value into the cell as legacy does, and a lifted closure's captured cell parameter is typed at the cell it holds.

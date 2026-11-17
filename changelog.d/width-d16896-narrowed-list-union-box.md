## Codegen, memory & runtime (Track B)

- **D16896 closed (clause 1):** reading `.length` or an element straight off a box narrowed to a union of lists no longer builds invalid wasm. For example, the else of `is string` over `i32[][] | f64[][] | string`. A binding inside an expression-position `if` arm, including the list-union rewrite's receiver, now registers the union it holds.

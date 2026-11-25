## Codegen, memory & runtime (Track B)

- **IR claims a loop whose hoisted receiver is a global list narrowed out of a union** (`const txt = readTextFile(..)`, then `if txt is IoError {..} else { while i < txt.length {..} }` at module scope or in a function). This is the `hoisted receiver read` the std int_text, float_text, json and base64 tests reach under I8.

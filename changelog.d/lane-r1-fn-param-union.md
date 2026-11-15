## Type system (Track A)

- **D16181 closed:** a function whose parameter is a union or `T | null` is delivered where the parameter is one of its members, adapted as a record arm is: `function w(a: i32 | string)` runs as a `(a: i32) => void` at an argument, a list or record literal, a return and a map value. A number widened into the parameter (`(a: f64)` at `(a: i32)`) stays refused.

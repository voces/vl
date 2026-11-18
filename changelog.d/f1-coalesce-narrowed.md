## Type system (Track A)

- **`??` over a read narrowed out of a union box:** a value narrowed to `T | null` out of a wider box (`i32 | null | string` past `!(e is string)`, an `else` arm, an early return, a `match`) takes `??` for a scalar, list or record `T`, where emit refused it. A string literal set's residual is still refused (D3172).

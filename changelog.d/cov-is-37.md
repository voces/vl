## Codegen, memory & runtime (Track B)

- **IR claims a captured union `let` with no initializer** (`let u: U` read by a closure): its cell starts as the null box, which the IR writes as legacy writes a bare `null`.

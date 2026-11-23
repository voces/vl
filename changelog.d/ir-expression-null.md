## Codegen, memory & runtime (Track B)

- **IR coverage:** a bare `null` literal is built where it stands: a shared `let` with no initializer starts as its cell's null box, a discarded or passed `null` is the `null` type's one value, and a parenthesised `(null)` lambda body returns its `boolean | null` or literal-union result's null.

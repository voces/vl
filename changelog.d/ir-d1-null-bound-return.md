## Codegen, memory & runtime (Track B)

- **D17092 closed:** a `null` handed to `h<Z>(z: Z | null): Z | null` binds `Z` at `never`, and the instance's annotated result is now `null`, as its parameter is, not `i32`: check-clean invalid wasm before. The same instance's `z is null` no longer falls to the "no union type declared" emit refusal.

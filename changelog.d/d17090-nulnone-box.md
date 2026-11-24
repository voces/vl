## Codegen, memory & runtime (Track B)

- **An assignment of `null` used as a value is the null its destination holds** (D17090): `const u: i32 | null = (s = null)`, passing `(s = null)` to an `i32 | null` or a `null` parameter, pushing it onto a `null[]` and setting it in a `null`-valued map all store and run. They built invalid wasm before.

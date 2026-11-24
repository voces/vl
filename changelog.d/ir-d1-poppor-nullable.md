## Codegen, memory & runtime (Track B)

- **`xs.pop() ?? d` and `xs.get(i) ?? d` kept nullable, or joined with a string, build again** (D17382, was invalid wasm). Over an `i32` list, and for `.get` an `f64` list, a `??` whose result is stored as a union box took the fused element read and wrote the default's box where the element is expected. It now takes the general `??`; a `??` that yields the element is byte-identical.

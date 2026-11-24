## Codegen, memory & runtime (Track B)

- **D17091 closed:** a `??` over a nullable boolean, string, record or literal union, boxed into a union argument after another operand (`f + show(rc ?? false)`, `pair(f, k ?? "a")`), built invalid wasm. The IR wrote the box's tag before the earlier operand. It now writes them in legacy's order.

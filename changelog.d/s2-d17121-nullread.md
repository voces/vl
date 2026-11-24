## Codegen, memory & runtime (Track B)

- **D17121 closed:** a `boolean | null` read narrowed to its `null` arm, delivered to a value-union destination (`i32 | null`, `f64 | null`, `i32 | string | null`), now runs at an argument, a `return`, an annotated binding, a field, an element, an assignment and a map value. Before, the null was boxed twice, which built invalid wasm. Neighbour filed: D17126.

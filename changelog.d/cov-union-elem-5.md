## Codegen, memory & runtime (Track B)

- **IR covers a list element or map value narrowed to its function arm (lane COV-UNION):** `xs[0](1)` and `m["a"](2)` under `is (x: i32) => i32` unbox the closure from the union box, as legacy's tail does (`narrowed-fn-arm-place-call` fully claimed; `index element coercion` 4 → 2 start rows on its class programs).

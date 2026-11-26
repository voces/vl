## Codegen, memory & runtime (Track B)

- **IR covers `xs[0].r ?? d` over a list element narrowed to its record arm (lane COV-UNION):** the element is read at its storage, the union box legacy unwraps, rather than at the narrowed record (`index element coercion` 20 → 16 rows on its class programs).

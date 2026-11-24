## Codegen, memory & runtime (Track B)

- **IR claims `xs.get(i)` and `s.bytes()` as legacy writes them** (capability probes `listget-string-element`, `get-u8-list-index`, `u8-list-slice`, `clear-over-scalar-list-reps`). A list `.get(i)` shares `.pop()`'s IR node and legacy tail, with the index read twice from the call as legacy reads it, over any element kind and over a held or staged receiver. `s.bytes()` is legacy's `__str_bytes__` call. Byte-identical. An index legacy stages (`get index staged`) and the fused `xs.get(i) ?? d` over a scalar list (`coalesce listGetOr`) stay named misses.

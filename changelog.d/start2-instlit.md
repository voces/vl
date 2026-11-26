## Codegen, memory & runtime (Track B)

- **IR claims a literal widened inside a pinned instance:** a literal that a hole forwarder hands to a wider parameter is written again at that width, as legacy writes it. `widen instLit` falls 15 → 0 programs: 14 are fully claimed, and `functions/hole-leaf-literal-through-forwarder.vl` moves on to `argument coercion`. Behaviour matches legacy on all 15, and 14 are byte-identical.

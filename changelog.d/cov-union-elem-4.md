## Codegen, memory & runtime (Track B)

- **IR covers an atom list's element narrowed to one literal, and a `boolean | null` element narrowed to `null` (lane COV-UNION):** the first is read at its atom and decoded by its consumer, as a field's is; the second is read for its effect beside a null compare (`index element coercion` 12 → 6 function rows on its class programs).

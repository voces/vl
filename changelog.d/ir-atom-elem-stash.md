## Codegen, memory & runtime (Track B)

- **IR soundness: a narrowed box-field read at a rep its field does not store (D17048).** A box local narrowed by a discriminant compare, read at a field whose storage is not the node's rep (an atom field at a `string` destination), was claimed as a string with no decode: check-clean, invalid wasm. The narrowed arm now takes the plain struct arm's kid-rep check, and the disagreement is the named miss `narrowed field read coercion`, written by legacy.

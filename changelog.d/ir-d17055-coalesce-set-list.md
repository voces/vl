## Codegen, memory & runtime (Track B)

- **Soundness: a `??` default over a map of a function set's lists (D17055).** `m4["absent"] ?? [inc0]`, where the map's lists hold two un-annotated functions, was check-clean but the module did not validate: the default was built as a list of closures against the set's id list. The function-set decision now joins a `??` default at the join's type, as it does a write's value, so the literal is built as the set's ids.

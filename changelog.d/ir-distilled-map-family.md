## Codegen, memory & runtime (Track B)

- **IR coverage: four map and print shapes, byte-identical to legacy.** The IR's print takes a `boolean | null` between legacy's own `br_table` blocks. An i64-keyed map's key is delivered at i64. `m.delete(k)` is a new `RMapDelete` over legacy's probe and tombstone. A walk's second name binds an index, or a map's i32 or string value. Legacy's delete, its `boolean | null` print and its pair counter are factored into shared tails, with no byte change. Distilled-corpus functions with no blocker rose 45,373 → 45,396, and tests/cases 71,527 → 71,594.

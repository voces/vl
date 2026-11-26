## Codegen, memory & runtime (Track B)

- **IR: a store whose value is another field or element store is built**: `store of a field or element write` 2 → 0 units in regen-11, one claimed under `VL_IR_REQUIRE_CLAIM=1` and one moved to `map store value store` (refactor-notes/2026-11-26-ir-chained-place-store.md).

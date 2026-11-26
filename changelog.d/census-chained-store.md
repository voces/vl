## Codegen, memory & runtime (Track B)

- **IR: a store whose value is another field or element store is built, and a map entry store whose value is a store stages its receiver and key below it**:
  - `store of a field or element write` 2 → 0 units in regen-11.
  - One unit is claimed under `VL_IR_REQUIRE_CLAIM=1`.
  - The other now reaches a masked miss, named `assignment value unwiden rep`.
  - A map entry write used as a store's value stays skipped (`store of a map entry write`).
  - Details: refactor-notes/2026-11-26-ir-chained-place-store.md.

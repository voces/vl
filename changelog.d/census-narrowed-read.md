## Codegen, memory & runtime (Track B)

- **IR: a walk over a packed sub-word list binds each element as an i32**: `narrowed read` 2 → 0 units in regen-11; `arrays/sub-word-lists.vl` is claimed under `VL_IR_REQUIRE_CLAIM=1`, and the verifier's walk rule widens every packed element (refactor-notes/2026-11-26-ir-sub-word-list-walk.md).

## Codegen, memory & runtime (Track B)

- **IR: a list field of a stored row is walked at the row's element**: `for in stored-row receiver` 2 → 0 programs in regen-10, both claimed under `VL_IR_REQUIRE_CLAIM=1` (refactor-notes/2026-11-26-ir-for-in-stored-row-receiver.md).

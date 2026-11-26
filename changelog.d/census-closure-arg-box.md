## Codegen, memory & runtime (Track B)

- **IR: a hole lambda's unset parameter takes its argument at the call key's slot** (an atom at an `i32` slot, a box at a union slot): `closure argument box` 6 → 0 programs in regen-10, 5 now claimed under `VL_IR_REQUIRE_CLAIM=1` (refactor-notes/2026-11-26-ir-hole-lambda-arg-at-key-slot.md).

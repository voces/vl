## Codegen, memory & runtime (Track B)

- **IR: a row-less receiver's field is read off its storage row**: `field read of a stored row` 3 → 0 programs in regen-10, all 3 claimed under `VL_IR_REQUIRE_CLAIM=1` (refactor-notes/2026-11-26-ir-rowless-receiver-storage-row-read.md).

## Codegen, memory & runtime (Track B)

- **IR claims a dense integer `match` on an unrolled range loop's variable:** the copy's constant is the `br_table` scrutinee. `int switch scrutinee` falls 1 → 0, and `loops/jump-from-value-arm.vl` is now fully claimed. Claimed and claims-off builds are byte-identical.

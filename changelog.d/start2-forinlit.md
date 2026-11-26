## Codegen, memory & runtime (Track B)

- **IR claims a walk over a list literal inside an unrolled range loop's copy:** the IR builds the literal itself rather than declining to copy legacy's pooled global. `for in literal in an unrolled copy` falls 2 → 0, and `loops/unrolled-range-loops.vl` is now fully claimed. Claimed and claims-off builds are byte-identical.

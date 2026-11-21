## Codegen, memory & runtime (Track B)

- **IR: the partially unrolled range loop and the rolled loop's wrap exit are built by the IR** (`SRangeLoop`, a migration node): its lowering drives legacy's split-out helpers, which take the scratch locals in legacy's order, around the IR's copies of the body, as legacy's plan (`rangePartialCopies`) says. `for range partial` 52 → 0 and `wrap exit` 5 → 0 first misses; +39 claimed functions (15 in the self-compile) and +6 start bodies. Byte-identical.

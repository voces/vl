## Codegen, memory & runtime (Track B)

- **IR: a fully unrolled range loop is built by the IR** from legacy's own unroll plan (`forRangeUnrollPlan`): a block of copies, each setting the loop var to its constant and reading that constant in the body, as legacy writes it. `for range unrolled` 85 → 0 first misses; +33 claimed functions and +13 start bodies. Byte-identical.

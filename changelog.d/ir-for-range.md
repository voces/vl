## Codegen, memory & runtime (Track B)

- **IR: a range loop legacy writes rolled is built by the IR** from the existing block, loop, branch and assignment nodes (`for v in a to b`, `until`, a static `step`, with `break` and `continue`). Every other arm is a named miss: unrolled, partial, getter, hoisted, proven, wrap exit, dynamic step. The builder's `statement` fall-through drops from 379 to 68 first misses; +58 claimed functions and +40 start bodies over the five I8 populations. Byte-identical.

## Codegen, memory & runtime (Track B)

- **IR: a map's `.length`:** `m.length` on a map builds in the IR as `RMapOp` `size`, the receiver then legacy's live entry count read, on `mapLengthPlain` and `mapSizeTail`, which legacy's member arm now writes through. Byte-identical; the self-compile claims 29 more functions, and its `member map` blocker (30 functions alone) goes to 0.

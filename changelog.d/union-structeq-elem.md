## Codegen, memory & runtime (Track B)

- IR re-entries `refListReadAt` and `emitIdxIndex` closed (lane COV-UNION, structEq hook step 3): a record compare's element side whose receiver or index is a place is re-read at each field from the bytes the IR reads it again with, not from its expression; the I8 sweep's causes drop both (unexplained 448 → 438).

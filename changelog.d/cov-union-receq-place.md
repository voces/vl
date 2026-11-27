## Codegen, memory & runtime (Track B)

- **IR builds a record compare whose element place reads a call or another element (lane COV-UNION):** `rows()[0] == grid[1][at(0)]` holds the receiver or index it cannot re-read at each field in a local of its own, evaluated once.

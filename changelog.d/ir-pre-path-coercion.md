## Codegen, memory & runtime (Track B)

- **IR coverage: a union box delivered at a wider union is retagged by the IR.** The coercion table's `mapRetag` refused the function (`pre-path coercion`); a migration `RMapRetag` now wraps the box built under the held seat, and its lowering is legacy's `emitMapRetagTail`, so the bytes are legacy's. The verifier keeps the box rep. listCopy, recCopy, fnClo and mapUnbox stay named misses.

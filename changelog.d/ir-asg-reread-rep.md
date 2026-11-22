## Codegen, memory & runtime (Track B)

- **IR coverage: a captured literal-union cell's assignment used as a `string` value.** The re-read atom is decoded to its member's string through the IR's existing widening route (`widenTo` → `atomToStr`, legacy's `emitAtomToStr`). Assignments whose value re-reads as a different closure or as a nullable stay named misses.

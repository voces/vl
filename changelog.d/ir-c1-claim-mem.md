## Codegen, memory & runtime (Track B)

- **IR claim: memory, SIMD, atomic and trunc-sat intrinsics ship.** `RMemAccess`, `RMemOp`, `RSimd`, `RAtomic` and `RTruncSat` leave the `other` family for a new `mem` family, which is claimed. A function whose only unclaimed nodes were those intrinsics now ships the IR's bytes; 3,397 tests/cases functions are released. It stacks on #9511, which keeps a function with a declaration-time memarg fold on legacy's path.
